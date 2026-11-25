# Technical decisions

Each entry gives the decision, its rationale, and its source. The full
reasoning lives in the linked documents. Do not reverse a decision silently: a
change needs an issue and a doc update, as
[docs/architecture.md](../architecture.md) requires.

## Architecture

- **Single API and single database, conventional REST.** This deliberately
  avoids microservices, offline sync, and bank aggregation, which keeps the code
  simple and extension points clear. Source: architecture.md "Consequences".
- **Zod is the executable contract.** OpenAPI is generated from the route
  schemas, so hand-written docs are never the only definition. Strict objects
  reject unknown fields, which is also how stale clients get rejected. Source:
  architecture.md.
- **No shared types workspace.** It was removed until real reuse justifies it.
  The mobile app validates responses with its own Zod schemas, and the
  framework-free category catalog is imported by path. Source: architecture.md
  "System shape".
- **One `/v1` contract, no rollout flags.** `/v2` and the flags were retired in
  the #69 cleanup. While the app is pre-release, breaking changes ship as
  matched API and mobile deploys. After a public release they need a new
  version. Source: finance-contracts.md "Version boundary".
- **Dependency injection through `buildApp(config, auth, {services})`.** Tests
  can build the app with only the services they need, with the logger off and
  custom rate limits. Source: `apps/api/src/app.ts`.

## Data and money

- **Integer minor units.** `amountMinor` is a positive integer and `direction`
  carries the meaning. Account opening balances are signed. Display formatting
  happens on the client using the currency exponent. Source: architecture.md
  "Money, currencies, and dates".
- **Permanent per-user currency (#93).** It starts null, CAD is only a UI
  suggestion, and it becomes write-once once confirmed, guarded by an owner lock
  and a DB trigger. Accounts inherit it.
- **Transaction currency derives from `Account.currency` (#94).** Write bodies
  carry no currency, and reassignment across currencies is rejected.
- **Idempotent creation (#95).** Each create carries a client `clientRequestId`
  (UUID), and the server computes a SHA-256 fingerprint of the original intent.
  Replay returns the current row, and a mismatch returns 409
  `IDEMPOTENCY_KEY_REUSED`. Hard delete releases the key; there are no
  tombstones or soft delete.
- **Shared immutable category catalog (#96).** It holds 80 rows with null owner
  and a stable `defaultKey`, initialized by the repeatable
  `npm run categories:init`, which rejects drift. Signup copies nothing.
  Personal subcategories can sit under shared roots.
- **Atomic transfers (#73).** A transfer is one aggregate with two balanced
  postings and a commit-time check. History shows it once. It is excluded from
  income and expense totals but included in balances.
- **Calendar dates.** `YYYY-MM-DD` stored as DATE, never converted through
  server timezones.
- **Invariants live in both SQL and the service.** Triggers, CHECKs, partial
  unique indexes, and composite `(id,userId)` FKs back up the service checks.
- **Merchant/payee removed from the UI and DTOs.** The legacy
  `Transaction.merchant` column is preserved. There is one optional `note`.

## Auth and security

- **Email/password plus Google.** Both produce PocketFinance-owned sessions.
  Passwords use Argon2 (`argon2`). Access tokens are short-lived JWTs (`jose`,
  15 minutes by default) signed with `ACCESS_TOKEN_SECRET`. Refresh tokens are
  random, stored as SHA-256 hashes, and rotate on every use. Reusing one
  revokes the session family. Source: authentication-plan.md.
- **Google identity is keyed by `sub`, never by email.** Accounts with matching
  emails are never auto-linked. Linking needs recent reauthentication plus fresh
  Google proof. Nonce challenges are one-time and stored server-side.
- **Persistent native sessions (#123).** Clients opt in with the header
  `X-PocketFinance-Session-Policy: persistent`. Older clients keep 30-day
  absolute and 7-day idle limits.
- **Mobile secrets live only in SecureStore.** An ambiguous refresh forces
  sign-in instead of blindly replaying a token.
- **Logging is allowlist-only and errors are generic.** Detailed diagnostics
  appear in development only. Source: DEVELOPMENT.md "Backend errors while
  testing with Expo".
- **Rate limiting is process-local.** Running multiple instances will need a
  shared store. Source: threat-model.md.

## Mobile and UX

- **Expo Go vs development builds.** Expo Go (`npm run dev:mobile -- --go`) and
  web support **demo mode only**. Real sign-in, SecureStore, and Google need a
  development build (`expo-dev-client`, EAS `development` profile, or
  `npx expo run:android --device`). Android LAN HTTP needs
  `EXPO_PUBLIC_ALLOW_LOCAL_HTTP=true` and is never allowed in production
  profiles (`app.config.ts`).
- **Entry-first navigation.** Add is home. The custom keypad has digits, a
  decimal point, backspace, and confirm. It does no arithmetic, and confirm
  validates and saves. The draft survives navigation and is discarded on sign
  out or demo exit without a prompt. Source: mobile-redesign/README.md.
- **One shared date-range control** (`date-picker.tsx`) serves both History and
  Reports. Selection happens in the calendar, and only Apply or Clear commits it.
- **Purple/pink minimal theme** with accessible contrast, held in tokens in
  `theme.ts`.
- **AI boundary.** Any model or tool output is a draft that needs explicit
  confirmation before it is persisted. Being able to call the API does not
  authorize an AI tool. Source: architecture.md "AI and automation boundary".

## Testing

- **Tests are real and required.** `passWithNoTests: false` is set. API unit
  tests exclude `tests/integration/**`.
- **Integration tests use disposable schemas.** Each suite creates a random
  `pocketfinance_test_*` schema, migrates from zero, and drops only that schema.
  They require a loopback URL. Source:
  `apps/api/tests/support/disposable.ts`.
- **Native boundaries are mocked in Jest.** Google, device storage,
  screen-reader, and font-scale behaviour need manual device verification.
