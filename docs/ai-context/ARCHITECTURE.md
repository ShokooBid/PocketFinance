# Architecture

This is a working map for development. The authoritative conventions are in
[docs/architecture.md](../architecture.md), and endpoint semantics are in
[docs/mobile-redesign/finance-contracts.md](../mobile-redesign/finance-contracts.md).
When this map and the code disagree, the code wins.

## System shape

```text
apps/mobile  ──HTTPS JSON, Bearer token──>  apps/api (one Fastify process)  ──>  PostgreSQL
 Expo Router                                Zod contracts → OpenAPI             Prisma + SQL triggers
 SecureStore tokens                         services own business rules         composite owner FKs
```

This is a **monolith API**. `apps/api/src/index.ts` builds one Prisma client and
every service, then passes them into `buildApp()`. There are no queues, caches,
or background workers. Logout deletes session rows directly, so there is no
cleanup job.

## Repository layout

```text
apps/api/src/
  app.ts            Fastify composition: logger redaction, request IDs, error envelope, CORS, rate limit, swagger
  index.ts          process entry: readConfig → createDatabaseClient → services → listen
  config.ts         Zod-validated env (fails closed, never prints values)
  errors.ts         ApiError(status, code, message)
  openapi.ts        generates dist/openapi.json without DB/Google
  <module>/contracts.ts  Zod request/response schemas (the executable contract)
  <module>/routes.ts     route registration, auth via app.authenticate, response schemas
  <module>/service.ts    Prisma logic inside db.$transaction, ownership checks
  modules: auth, preferences, accounts, categories, transactions, transfers, history, dashboard, finance(names)
  generated/prisma/ (git-ignored, from `npm run db:generate`)
apps/api/prisma/    schema.prisma, 20 migrations (Oct 17 – Nov 25 2026), seed.ts (opt-in synthetic)
apps/api/tests/     unit tests (*.test.ts) + integration/ (real PostgreSQL), support/disposable.ts
apps/mobile/src/
  app/              Expo Router routes: _layout, sign-in, sign-up (both via auth-form.tsx), (app)/{index=Add, transactions=History, overview, settings=Accounts, categories, import, transactions/[id], transfers/[id]}
  auth/             session-controller, transport (fetch + Zod + ClientFailure), secure-store, google(.native).ts
  *-data.ts         portable data adapters/schemas (live HTTP source + in-memory demo source)
  use-*.ts          state hooks (report, history, finance picker, account/transfer management)
  *-context.tsx     providers (categories, preferences, transactions, entry draft)
  *.tsx             screens/components; ui.tsx primitives; theme.ts tokens
apps/mobile/tests/  Jest unit tests + integration/*.integration.ts (Vitest, real API + DB)
scripts/            generate-category-icons.mjs, test-integration-local.mjs
```

## API surface (verified from `routes.ts`)

All routes except `/health` require `Authorization: Bearer <accessToken>`, apart
from the unauthenticated auth bootstrap routes.

| Area        | Routes                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health      | `GET /health`                                                                                                                                                |
| Auth        | `POST /v1/auth/register`, `/login`, `/google/challenges`, `/google`, `/logout` (`allSessions` flag); `GET /v1/me`                                          |
| Preferences | `GET`, `PATCH /v1/preferences` (permanent `entryCurrency`, `defaultAccountId`, derived `hasActiveAccounts`)                                                  |
| Accounts    | `GET /v1/accounts`, `GET /v1/accounts/:id` (balance `asOf`), `POST /v1/accounts`, `PATCH /v1/accounts/:id`, `POST /v1/accounts/:id/archive`                |
| Categories  | `GET /v1/categories`, `/recent`, `/last-used`, `/:id`; `POST /v1/categories`; `PATCH /:id`; `POST /:id/archive`                                              |
| Txns        | `GET`, `POST /v1/transactions`; `GET`, `PATCH`, `DELETE /v1/transactions/:id` (cursor `YYYY-MM-DD_uuid`, limit ≤100, range ≤366 days)                      |
| Transfers   | `GET`, `POST /v1/transfers`; `GET`, `PATCH`, `DELETE /v1/transfers/:id`                                                                                    |
| History     | `GET /v1/history`: logical rows (transactions plus each transfer once), with `after`/`before`/`focusId` paging                                              |
| Reports     | `GET /v1/dashboard/summary`: `currency` plus either `from`/`to` (≤366 days) or `allDates=true`. Returns totals, category and root breakdowns, ≤20 recents   |

Supported currencies (`currencySchema`): CAD, USD, EUR, GBP, INR, JPY, KWD.

### Cross-cutting API behaviour (`app.ts`)

- **Errors:** an `ApiError` returns its own status and code. Validation failures
  return 422 `VALIDATION_ERROR`. Other 4xx become `BAD_REQUEST` or
  `RATE_LIMITED`, and everything else becomes 500 `INTERNAL_ERROR`. Every error
  body is `{error:{code,message,requestId}}`. Detailed diagnostics are logged
  only when `NODE_ENV=development`.
- **Requests:** request IDs are server-generated UUIDs and returned in the
  `x-request-id` header. Every response sends `cache-control: no-store`. The body
  limit is 32 KB, `trustProxy` is false, and request bodies and headers are never
  logged.
- **Rate limits:** the global limit is 60 requests per minute per IP. Auth routes
  add a per-identity limiter of 10 attempts per 15 minutes. Both are
  **process-local**.
- **CORS:** exact-origin allowlist (`CORS_ORIGINS`), which must be HTTPS in
  production. Native clients send no `Origin`.

## Data model (`schema.prisma`)

| Model                                                    | Notes                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`                                                   | Email is unique. `passwordHash` is nullable for Google-only users. `googleSubject` (unique) is the verified Google `sub`. `disabledAt` blocks every session.                         |
| `Session`                                                | One signed-in device: `userId`, unique SHA-256 `tokenHash`, `createdAt`. No expiry; logout deletes the row. Google nonces are stateless HMAC values, not rows.                      |
| `FinancePreferences`                                     | `entryCurrency` is null until chosen and then immutable (enforced by an SQL trigger). Optional default account.                                                                     |
| `Account`                                                | Owned. Type is cash, bank, credit, or other. `currency` is immutable. `openingBalanceMinor` is fixed after creation. `openingDate` is editable up to the earliest posting. Archived via `archivedAt`. |
| `Category`                                               | One table. `userId = null` plus a `defaultKey` marks the shared immutable catalog (80 rows). Rows with an owner are personal. Exactly two levels.                                    |
| `Transaction`                                            | Direction is income or expense, with positive `amountMinor`. `date` is a DATE column. Optional `transferId` and `importId`. `clientRequestId` + `creationFingerprint` provide idempotency. `merchant` is a legacy column kept but unused. |
| `Transfer`                                               | An aggregate with exactly two postings (one per direction) checked at commit. It has its own request identity.                                                                     |
| `Import` (+ `ImportStatus`)                              | **Metadata only.** It has no routes or service yet.                                                                                                                                  |

Prisma alone doesn't express several invariants, so the migrations add them in
SQL: partial unique indexes on normalized active names, composite
`(id, userId)` FKs (owner-safe references), CHECKs, triggers that guard currency
immutability, category hierarchy, transfer balance, opening-date limits, and
creation-identity immutability. **Read the migration SQL before changing a
model.**

Concurrency follows one pattern: services run inside `db.$transaction` and take
`SELECT … FOR UPDATE` on the `User` row (`lockFinanceOwner`) before any finance
write. The category catalog initializer uses `pg_advisory_xact_lock`.

## Mobile architecture

- **Routing:** `src/app/_layout.tsx` restores the session before rendering.
  `(app)/_layout.tsx` stacks the providers (Categories → Preferences →
  Transactions → Entry) and renders `FinanceSetup`. That component blocks finance
  routes until a currency is chosen and an active account exists. A custom tab
  bar shows Add, History, and Overview. The other routes (Accounts, categories,
  import, detail pages) are declared but hidden from the bar.
- **Data sources:** each domain has a source interface with an HTTP
  implementation (via `Transport`) and an in-memory demo implementation, so the
  demo shares UI code but makes no network calls.
- **Transport and auth:** `auth/transport.ts` validates every response with Zod
  and maps failures to a fixed `ClientFailure` kind, so raw errors never reach
  the UI. `session-controller.ts` restores the stored device token, verifies it
  with `/v1/me`, and signs out on any 401 (no refresh, no replay). Epochs discard
  stale responses after logout or account switch. The token is stored in
  SecureStore only.
  Web supports the demo only, because the API URL and SecureStore are disabled
  there.
- **Google Sign-In:** `google.native.ts` lazily loads
  `react-native-nitro-google-signin`. It refuses to run in Expo Go
  (`executionEnvironment === "storeClient"`) or without client IDs. On web,
  `google.ts` throws a configuration error. Native sign-in therefore needs a
  development build (`eas.json` profile `development`, or
  `npx expo run:android`).
- **Reports:** `use-report.ts` uses request sequencing to drop stale responses.
  `report-data.ts` reconciles parent and child category totals without double
  counting. The live screen never downloads transaction pages to compute totals.

## Frontend/backend type sharing (current state)

There is **no shared package**. `docs/architecture.md` records that the
placeholder was removed "until real reuse justifies it".

- Mobile redefines its own Zod schemas (for example `transaction-data.ts` and
  `transaction-api.ts`) and validates API responses at runtime.
- Mobile imports exactly one API file in production code:
  `apps/api/src/categories/catalog.v1.ts`. It is the framework-free catalog
  manifest, imported by relative path from `category-data.ts`.
- Mobile integration tests import the API's `buildApp` and services directly to
  run the real client against Fastify and a disposable database. This is the
  main drift guard between the two contracts, alongside the generated OpenAPI
  artifact in CI.
