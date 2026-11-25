# Feature status

Verified against source on 2026-11-25. Status labels:

- **Done:** implemented in API and mobile, with tests.
- **Partial:** some layers exist but the feature is incomplete.
- **Planned:** documented in issues or docs, with no code.
- **Not planned for MVP:** listed under "Explicitly excluded" in
  [docs/mvp-scope.md](../mvp-scope.md).

"Done" means automated tests exist. Device and accessibility acceptance (#77)
is still outstanding for most mobile flows; see
[verification.md](../mobile-redesign/verification.md).

## Core finance

| Feature                                          | Status | Evidence                                                                                                                                                      |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email/password register, login, logout           | Done   | `api/src/auth/*`, `mobile/src/app/sign-in.tsx`, tests in both workspaces                                                                                      |
| Persistent native sessions, refresh rotation     | Done   | #123, migration `20261119…persistent_native_sessions`, `session-controller.ts`                                                                                |
| Google Sign-In                                   | Done (code) | API verification plus native client. **Requires OAuth setup and a dev build; not testable in Expo Go or on web.** Device acceptance is manual.             |
| Google account linking, all-device logout        | Partial | API only (`/v1/auth/google/link`, `logout {allSessions}`). No mobile UI is documented as built.                                                              |
| Sign in with Apple                               | Planned | Required before iOS distribution (#22, authentication-plan.md). Not implemented.                                                                             |
| Permanent currency selection                     | Done   | #93, `preferences/*`, `finance-setup.tsx`, `currency-settings.tsx` (single Currency dropdown since #137, current branch)                                       |
| Multiple named accounts (create/edit/archive)    | Done   | #68, #124, `accounts/*`, `account-management.tsx`. Opening-date edit up to the earliest activity: migration `20261123…edit_account_opening_date`. #137 (current branch) adds edit-form scroll and inline save-error notice. |
| Account balances                                 | Done   | `GET /v1/accounts/:id?asOf=` (opening balance plus postings, including transfers)                                                                             |
| Income and expense CRUD                          | Done   | `transactions/*`, `transaction-entry.tsx` (custom keypad), idempotent create (#95)                                                                            |
| Categories and subcategories                     | Done   | 80-row shared catalog (#96) plus personal categories, two levels, archive (no delete)                                                                         |
| Transfers between accounts                       | Done   | Same currency only, atomic two-leg aggregate (#73, #74). The destination picker offers "Clear selection" (#137, current branch).                               |
| Transaction history                              | Done   | `GET /v1/history`, `history-screen.tsx`. Filters: date range, account, category (+subcategories), type, currency                                               |
| Monthly summaries / Overview Reports             | Done   | #117. Overview opens on the current local month. Income and Expenses cards have expandable categories. Arbitrary range or all dates.                           |
| Period comparison                                | Not implemented | Removed during #117 refinements. `report-data.ts`, `reports-screen.tsx` and `use-report.ts` compute none. README was corrected on 2026-11-25. |
| Charts                                           | Planned | The tab is rendered disabled ("Charts are not available in this version") in `reports-screen.tsx`                                                             |
| In-memory demo mode                              | Done   | Web and Expo Go, with no backend                                                                                                                              |
| OpenAPI generation                               | Done   | `npm run openapi --workspace=@pocketfinance/api`, uploaded as a CI artifact                                                                                   |

## Import and AI

| Feature                                       | Status              | Evidence                                                                                                                                                    |
| --------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV bank statement import                     | Partial (placeholder) | `/import` route renders `PlaceholderScreen`. `Import` model and `Transaction.importId` exist. No upload, parse, or routes. Planned as #78 (batches) and #79 (CSV). |
| PDF statement import                          | Planned             | #80. Layouts, OCR, and retention are undecided.                                                                                                             |
| Inert AI entry points (text/voice/receipt)    | Planned             | #76. No such UI exists in `apps/mobile/src`. mvp-scope, architecture and mobile-redesign README were corrected on 2026-11-25. |
| Natural-language transaction entry            | Not planned for MVP | Excluded in mvp-scope. A later increment may add it as a draft plus confirmation.                                                                          |
| Voice-based entry                             | Not planned for MVP | Excluded in mvp-scope                                                                                                                                       |
| AI categorization                             | Not planned for MVP | Excluded in mvp-scope                                                                                                                                       |
| Spending explanations and insights            | Not planned for MVP | Excluded in mvp-scope                                                                                                                                       |
| Confirm before saving AI output               | Decided (rule)      | Binding rule in architecture.md "AI and automation boundary". Nothing implements it yet.                                                                   |

## Explicitly out of scope (mvp-scope.md)

Bank connections, budgets, goals, recurring transactions, multi-currency
conversion, shared or household ledgers, receipt OCR, offline sync, production
release, and payments.

## Engineering

| Item                                              | Status   |
| ------------------------------------------------- | -------- |
| CI: format, lint, typecheck, unit, integration, build, OpenAPI | Done (`.github/workflows/quality.yml`) |
| Integration tests against real PostgreSQL         | Done (per-suite disposable schema)     |
| E2E / Playwright                                  | **Absent.** Only ignored `.playwright-mcp/` console logs from ad-hoc browser sessions exist. |
| Native build in CI (EAS)                          | Absent. `eas.json` has an empty `production` profile. |
| API deployment / container image                  | Absent. No Dockerfile or hosting config. |
| Shared rate limiter for multiple API instances    | Absent. The limiter is process-local (threat-model.md). |
| Backups and restore objectives                    | Not defined (threat-model.md) |
