# PocketFinance

A personal-finance mobile app for tracking income, expenses, transfers, and spending
across financial accounts. Built with React Native, Expo, TypeScript, and a
Fastify/PostgreSQL API.

PocketFinance focuses on accurate money handling, explicit data ownership, and
secure mobile sessions. An isolated demo lets you explore the app without an
account or a running backend.

**Status:** Pre-release portfolio project. Core manual tracking is implemented;
Overview Reports is implemented; Charts is unavailable and CSV import is a UI
placeholder. Use synthetic data when evaluating the app.

## What you can do

- Sign in with email/password or Google on a configured native build; restore
  sessions from secure device storage and sign out on one or all devices.
- Choose a permanent ledger currency and create financial accounts with opening
  balances and an optional default account.
- Organize transactions with shared default categories and personal categories,
  including subcategories and archival that preserves history.
- Add, edit, delete, and filter income and expenses by account, category, date,
  direction, and currency.
- Move money between two owned accounts with a same-currency transfer; review,
  edit, or delete the transfer as one record.
- Review date-grouped History and expandable Income/Expenses reports, including
  category totals and changes against the preceding period.
- Explore categories, transactions, and summaries in a temporary in-memory demo.

## Try the demo

Use Node.js 22.x (at least 22.13; see [.nvmrc](.nvmrc)) and npm 10.x.
From the repository root:

```sh
npm ci
npm run dev --workspace=@pocketfinance/mobile -- --web
```

Choose **Explore demo screens without signing in** on the sign-in screen. No database, environment file, or
credentials are required. Demo changes are temporary and make no API requests;
web supports demo mode only.

### A short walkthrough

1. Confirm a ledger currency and create a demo account with an optional opening balance.
2. Use **Add** to record synthetic income and expenses, assigning a parent category
   or a subcategory. Create another account to try a transfer.
3. Open **History** to filter records or select one for editing. Transfers appear once.
4. Open **Overview → Reports** to see the full current month immediately. Expand a
   category to reconcile its direct entries and subcategories.
5. Open the single date range selector, choose a range or one day, and press
   **Apply** inside the calendar. **Clear** shows all dates. History uses the same control.

Returning to Overview starts a new current-month report. Empty Income and Expenses
cards explain that no activity was recorded; opening balances and transfers do not
inflate those totals. The demo starts with no transactions and keeps your edits
only for that demo session.

For an SDK-compatible Expo Go demo, run
`npm run dev --workspace=@pocketfinance/mobile -- --go`.
For the API, PostgreSQL, and native authentication setup, see
[DEVELOPMENT.md](DEVELOPMENT.md).

## Architecture and engineering decisions

```text
React Native / Expo -> Fastify REST API -> PostgreSQL
  secure sessions       Zod contracts      Prisma + SQL migrations
```

The mobile client validates API responses at its transport boundary. The shared
category catalog is a framework-free manifest; database access stays on the API.
The API publishes OpenAPI from its route schemas and enforces server-side authorization.

- **Exact money:** amounts use integer minor units with currency-specific decimal
  parsing. Account currency determines transaction currency; reports never combine
  currencies into a converted total.
- **Data ownership:** authenticated sessions determine the ledger owner. Service
  checks and database constraints protect account and transaction relationships;
  shared default categories remain visible across users.
- **Explicit retry handling:** transaction creation uses a request UUID and an
  immutable creation fingerprint to recognize equivalent retries. Protection lasts
  while the transaction exists; hard deletion releases the key.
- **Session recovery:** refresh-token rotation, server revocation, and secure
  credential storage are handled outside UI rendering. Ambiguous refresh outcomes
  require explicit sign-in recovery.
- **Accounting dates:** transactions use calendar dates rather than converting
  accounting days through server timezones.
- **Aggregate reporting:** the API totals persisted postings for one currency;
  the client never downloads transaction pages to calculate live reports. Exact
  category groups reconcile parent and child amounts once. Reports fetches totals
  for the selected date range.

## Explore the code

| Area                  | Start here                                                                                                        | What to look for                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| API composition       | [app.ts](apps/api/src/app.ts)                                                                                     | Route registration, dependencies, and error handling.                                |
| Transaction rules     | [service.ts](apps/api/src/transactions/service.ts)                                                                | Ownership, validation, and retry identity.                                           |
| Database design       | [schema.prisma](apps/api/prisma/schema.prisma) and [migrations](apps/api/prisma/migrations)                       | Relationships, indexes, and SQL-enforced invariants.                                 |
| Mobile authentication | [session-controller.ts](apps/mobile/src/auth/session-controller.ts)                                               | Session lifecycle and injected storage/provider boundaries.                          |
| Reports UI and state  | [reports-screen.tsx](apps/mobile/src/reports-screen.tsx) and [use-report.ts](apps/mobile/src/use-report.ts)       | Expandable cards, loading/retry states, and stale-response protection.               |
| Report calculations   | [report-data.ts](apps/mobile/src/report-data.ts)                                                                  | Selected-range totals and exact category reconciliation.                             |
| Report API            | [dashboard/service.ts](apps/api/src/dashboard/service.ts) and [contracts.ts](apps/api/src/dashboard/contracts.ts) | Owned SQL aggregates, currency filtering, safe integer bounds, and repeatable reads. |
| Shared date selector  | [date-picker.tsx](apps/mobile/src/date-picker.tsx)                                                                | One range control for History and Reports, with internal Apply/Clear actions.        |
| Integration tests     | [API tests](apps/api/tests/integration)                                                                           | Real PostgreSQL migrations, authorization, and finance contracts.                    |
| Delivery checks       | [quality.yml](.github/workflows/quality.yml)                                                                      | Automated validation and generated OpenAPI artifact.                                 |

## Stack and verification

| Layer       | Tools                                                            |
| ----------- | ---------------------------------------------------------------- |
| Mobile      | React Native, Expo Router, TypeScript, Expo SecureStore          |
| API         | Node.js, Fastify, Zod, REST/OpenAPI                              |
| Persistence | PostgreSQL, Prisma, SQL migrations                               |
| Tests       | Vitest, Jest, React Native Testing Library                       |
| Tooling     | npm workspaces, Docker Compose, ESLint, Prettier, GitHub Actions |

The [quality workflow](.github/workflows/quality.yml) runs formatting, lint, type
checks, unit tests, API/mobile integration tests against PostgreSQL, Prisma
validation/generation, and the API build on pull requests and pushes to `main`.
Native Google sign-in and device accessibility still require manual verification.
See [development checks](DEVELOPMENT.md#verification) for local commands.
Report-specific evidence and the outstanding device checks are recorded in
[the verification log](docs/mobile-redesign/verification.md#issue-117-overview-reports-2026-11-17).

## Current boundaries

Charts, CSV file selection and import, bank connections, and offline sync are
not implemented. Reports do not perform currency conversion. Google sign-in
requires OAuth configuration and a native development build. Account deletion
uses manual contact instructions; automated deletion and a support response-time
commitment are not established.

## Documentation

- [Development guide](DEVELOPMENT.md): database, API, native configuration, and tests.
- [Architecture](docs/architecture.md): system shape and API conventions.
- [Product scope](docs/mvp-scope.md): MVP boundaries and planned capabilities.
- [Authentication plan](docs/authentication-plan.md): account and session design.
- [Mobile redesign](docs/mobile-redesign/README.md): decisions, UX, finance contracts, and verification.
- [Threat model](docs/threat-model.md): trust boundaries and security limitations.
- [Contributing](CONTRIBUTING.md): development baseline and contribution workflow.
- [Security policy](SECURITY.md): private vulnerability reporting.
