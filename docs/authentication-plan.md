# Authentication plan: email/password, Google, and sessions until sign-out

Accepted on 2026-10-19 at the user's request and implemented in Issues #7, #11
and #16. **Simplified on 2026-11-25**
([#143](https://github.com/ShokooBid/PocketFinance/issues/143)): the
original JWT + rotating refresh-token design, Google linking and
reauthentication were replaced by one opaque session token per device. The
section [Why the design was simplified](#why-the-design-was-simplified) records
the trade-off. See the [development guide](../DEVELOPMENT.md) for configuration
and verification, and the [API source](../apps/api/src/openapi.ts) for routes.

The avatar menu offers **Accounts** and **Sign out** or **Exit demo**
([#124](https://github.com/ShokooBid/PocketFinance/issues/124)). Signing out or
exiting the demo discards the transaction draft without a prompt. All-device
sign-out is an API capability.

## User experience

Signed-out users see two screens that link to each other with `router.replace`:
**Sign in** (`/sign-in`, password autofill `current-password`) and **Create
account** (`/sign-up`, `new-password`, a live 12–128 character rule and a
neutral message when registration is refused, so emails cannot be probed). Both
share `src/auth-form.tsx`; the rules live in `src/auth-form-data.ts`. Continue
with Google appears on both, only in builds where Google is configured, and
finds or creates the account. After registration, finance setup (currency, then
first account) completes onboarding. Both methods lead to the same
PocketFinance account model and session mechanism. A signed-in device
**stays signed in until the user signs out**: closing/reopening the app restores
the session with no renewal step. Sign-out on another device ("all devices"), a
disabled account, or missing secure credentials require signing in again.
Google cancellation leaves the sign-in screen usable; provider failure does not
disable email/password. Biometric app lock, MFA, password recovery, automatic
account merging, linking a second login method and unlinking remain separate work.

## Database responsibilities

| Model | Meaning and invariant |
| --- | --- |
| `User` | Stable owner of finance data. `passwordHash` is null for Google-only users. `googleSubject` is Google's verified `sub`, unique and nonblank when set; it is never an email or client value. `emailVerifiedAt` records verified contact email; `disabledAt` blocks every session immediately. |
| `Session` | One signed-in device: `userId`, a unique SHA-256 hex `tokenHash`, `createdAt`. There is no expiry; deleting the row is revocation. |

Password hashes use Argon2id. Session tokens have 256 bits of cryptographically
random entropy, so a SHA-256 hash supports lookup without storing the bearer
secret. Do not hash human passwords with plain SHA-256. SQL enforces hash syntax,
token and subject uniqueness and nonblank subjects; it cannot prove randomness or
that the application actually hashed a secret.

Migration `20261125000000_opaque_sessions` copies each `AuthIdentity` subject onto
its existing user (same user ID, so linked and Google-only ledgers are kept),
drops `AuthIdentity`, `AuthChallenge`, `RefreshToken` and the `AuthProvider`
enum, and deletes all old sessions: every device signs in once more. No finance
row is changed. Foreign keys use RESTRICT; account deletion, when built, must
delete sessions and owned finance data explicitly.

The service creates a Google user atomically with its subject, rejects disabled
accounts, and never issues a session without a valid password or Google proof.

## Password registration and login

- Normalize email by trimming and lowercasing in every path, including Google
  email collisions. The `User_normalized_email_key` index closes races.
- Validate password strength, hash with Argon2id, and rate-limit registration and
  login per IP and per normalized email. Never store plaintext or log bodies.
- Null, malformed, disabled-fixture hashes, disabled users and unknown users all
  fail with the same generic credential error after one Argon2 operation.
- First-party registration does not assert email ownership; `emailVerifiedAt`
  stays null.

## Google sign-in

1. The app calls `POST /v1/auth/google/challenges` and receives a short-lived
   nonce (`CHALLENGE_TTL_SECONDS`, default 300). The nonce is stateless:
   `<expiry>.<random>.<HMAC-SHA256>` signed with `ACCESS_TOKEN_SECRET`. It is not
   stored and **not single-use**; it only proves the ID token was requested for
   this server within the window.
2. The native Google SDK embeds that exact nonce in the ID token. The backend
   rejects a forged or expired nonce before any provider I/O, then verifies the ID
   token's signature, issuer, configured audience, authorized presenter, expiry,
   subject and nonce equality. A client-supplied user ID is never accepted.
3. Resolve `User.googleSubject` first, so the owner stays stable when Google
   changes the email claim.
4. For a new subject, require a verified email with no existing account and
   create the user with its subject atomically.
5. If the email already belongs to a PocketFinance account, return the generic
   credential error. Accounts are never merged by email, and Google cannot be
   added to an existing password account in this version.
6. Success issues a PocketFinance session token. Google ID tokens are never API
   bearer tokens; only identity scopes are requested.

These choices follow Google's
[OpenID Connect verification guidance](https://developers.google.com/identity/openid-connect/openid-connect).

## Sessions

Login, registration and Google sign-in return `{ accessToken, tokenType: "Bearer" }`.
`accessToken` is an opaque 43-character random value; only its hash is stored.
Every protected request hashes the bearer token and loads the session with its
user in one lookup, rejecting a missing session or disabled user. Responses are
the same generic 401 for every failure.

`POST /v1/auth/logout` deletes the current session, or all of the user's
sessions with `{ "allSessions": true }`. Revocation is immediate and nothing is
left behind, so no cleanup job exists. Raw tokens, authorization headers and
Google proofs never belong in logs.

The mobile app stores `{ version: 2, token }` in Expo SecureStore
(`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) and verifies it with `GET /v1/me` before
showing authenticated navigation. Any 401 clears the stored token and returns to
sign-in; requests are never replayed. A network failure, rate limit or server
outage keeps the token and offers a retry. If the server cannot confirm logout,
the app still clears local credentials and reports that the server session may
remain active; a later all-device sign-out removes it. A stored version 1
(refresh-token) record fails validation and is discarded.

For native verification on a development build: sign in, close the app, change
the device clock or wait, reopen and confirm protected screens load with no auth
request other than `/v1/me`. With two devices, confirm device sign-out revokes
only its session and all-device sign-out revokes both.

## Why the design was simplified

The previous design used 15-minute JWTs plus rotating refresh tokens with replay
detection, persistent/bounded session policies, a reauthentication window, a
Google linking flow, single-use challenge rows and a cleanup CLI: five auth
tables and a large client state machine (single-flight refresh, a durable
"refresh pending" marker, an ambiguous-renewal state). For a pre-release,
single-API portfolio app whose requirement is "stay signed in until sign-out",
that machinery mostly protected against a lifetime the product no longer wanted.

Kept: hashed storage, instant server-side revocation (per device and all devices),
disabled-account blocking, owner scoping, generic errors and Google verification.
Given up, deliberately:

- **Stolen token theft detection.** A copied token works until sign-out; there is
  no rotation to reveal reuse. Mitigation: SecureStore device-only storage, HTTPS,
  and remote all-device sign-out.
- **Single-use Google nonces.** A captured ID token could be replayed within the
  nonce window; it still requires a valid Google signature for this app.
- **Google linking and reauthentication.** Password users cannot add Google later.

Reconsider rotation or expiry before handling real financial data at scale.
OAuth background: [RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14).

## Provider setup and mobile builds

Native Google sign-in needs an Expo development build/config plugin; it cannot
be tested in Expo Go. See
[Expo's Google authentication guide](https://docs.expo.dev/guides/google-authentication/).

Configure a Google project/consent screen with synthetic test users, Android
package name and signing certificate fingerprints, iOS bundle identifier, and
the backend/web audience as required by the chosen library. Keep development and
release client registrations distinct and document their allowed audiences. Public
OAuth client IDs may be app configuration; client secrets/signing keys may not.
Browser OAuth fallback, if introduced, uses PKCE, state, exact redirect
validation and a system browser, never an embedded password webview.

Before iOS distribution, Issue #22 must review Apple's
[Login Services guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services).
Google login generally requires an equivalent login option meeting Apple's
privacy requirements unless an exception applies. Ordinary email/password alone
does not establish that exception. Plan Sign in with Apple or a documented
qualifying alternative before submission.

## Issue history and verification

| Issue | Responsibility |
| --- | --- |
| [#6](https://github.com/ShokooBid/PocketFinance/issues/6) | Original schema, additive migration, disabled synthetic seeds, fresh/upgrade database tests. |
| #8 | Fastify, validated contracts, redaction, configuration foundation before auth routes. |
| [#7](https://github.com/ShokooBid/PocketFinance/issues/7) | Password and Google backend login (originally with rotation and linking). |
| [#11](https://github.com/ShokooBid/PocketFinance/issues/11) | Native Google development build, forms/provider flow, secure session restore. |
| [#16](https://github.com/ShokooBid/PocketFinance/issues/16) | Current/all-device logout and accurate privacy statements (linking later removed). |
| [#20](https://github.com/ShokooBid/PocketFinance/issues/20) / [#21](https://github.com/ShokooBid/PocketFinance/issues/21) | API and mobile auth tests. |
| [#22](https://github.com/ShokooBid/PocketFinance/issues/22) | Physical-device and iOS login-policy review. |

Tests use only synthetic subjects and token hashes; CI never contacts Google or
needs real credentials. Provider verification uses local signed fixtures; manual
development-build tests verify the actual Google setup. Finance ownership
protections remain required for all login methods.
