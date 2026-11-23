# MVP scope and product boundaries

## Status

Accepted target, amended on 2026-10-30 by
[Issue #64's confirmed decisions](mobile-redesign/README.md),
[UX specification](mobile-redesign/ux.md) and
[finance contracts](mobile-redesign/finance-contracts.md). This describes planned
behavior, not features already implemented. The manual redesign and subsequent
statement-import increments have separate acceptance/release gates.
The [root README](../README.md) describes current capabilities. Overview Reports
is implemented in the #117 working branch; Charts remains unavailable. Local
verification is recorded [separately](mobile-redesign/verification.md#issue-117-overview-reports-2026-11-17)
and does not establish device or release acceptance.

## Product goal

Enable one person to safely track their own spending and income without handing
their banking credentials to PocketFinance. The MVP should prove that manual
tracking and statement import are useful, understandable, and dependable.

## In scope for the MVP

### Identity and privacy

- Register, sign in, refresh a session, and sign out from the avatar menu.
- Support email/password and Google sign-in, with persistent mobile sessions
  across app restarts. Google-only accounts do not require a PocketFinance password.
- The API supports explicitly linking Google to an existing account after proving
  both identities. Matching email addresses alone never merge accounts.
- Restore sessions from secure storage, rotate refresh tokens, and revoke the
  current session on logout. Expired/revoked sessions require sign-in again.
- Isolate each user's records. A user can only create, read, update, archive, or
  delete their own data.
- Explain that PocketFinance does not connect to a bank in the MVP.

### Categories

- List fixed default and personal categories/subcategories, with exactly two levels.
- Defaults cannot be renamed, archived or otherwise edited by users. The user
  has approved the catalog. #96 initializes one shared immutable catalog instead
  of copying it at signup; personal categories remain private.
- Create, rename and archive personal categories; personal children can attach to
  either a default root or a personal root. Select either parent or child.
- Prevent category deletion or archiving from silently corrupting past records;
  existing transactions retain their historic category association.

### Named financial accounts and currency

- Manage user-named accounts such as BMO, CIBC and Cash in Accounts. Opening
  balance defaults to zero and is fixed after creation. The opening date can be
  changed to the earliest transaction or transfer date or any earlier date.
  Account names do not imply a bank connection. A default account is optional.
- Require explicit currency selection after sign-in, with CAD suggested locally.
  The choice becomes permanent when confirmed. A missing choice or no active
  accounts blocks main finance and transaction routes, including deep links.
  Setup, Accounts and sign-out remain available during repair, which retains drafts.
  Account creation inherits the permanent choice. No first-posting lock exists.
  #94 removes duplicated transaction currency and legacy finance backfill code;
  #95 stores immutable request identity on each manual transaction, with retry
  protection while the row exists. Hard deletion releases that identity; a late
  retry may recreate it. #96 shares immutable defaults, permits personal children
  under shared roots and enforces visible sibling-name conflicts. These four
  foundation increments precede #72 and remaining redesign work.
- Associate every new transaction with an owned compatible account; show tracked
  balances derived from opening balance and posted records, including transfers.
- Support same-currency transfers between two different owned accounts atomically.
  Editing/deleting affects both postings. No foreign exchange or fee allocation.

### Manual transactions

- Add, list, filter, edit, and delete manual income and expense transactions.
- Record direction, integer minor-unit amount, transaction date, account, category
  and one optional description/note. Currency comes from immutable Account.currency
  in responses, formatting and reports; transaction writes omit it. Reject
  cross-currency reassignment; never convert or reinterpret the amount. No merchant/payee/payer
  fields in redesigned input; preserve legacy stored values during migration.
- Make Add the post-login home, with History and Overview in the bottom bar and
  Accounts in the avatar menu. The custom digits, decimal, backspace and confirm
  keypad validates the complete form and saves once on confirmation. Drafts
  persist during navigation and end on sign-out or demo exit.
- Validate all required fields and give accessible error feedback.

### Reports and history

- Show separate Income and Expenses cards in Overview Reports, with expandable
  category totals and a short empty message per section.
- Load the full local current month on Overview entry. Share one range selector
  with History; Apply commits dates and Clear shows all dates. Keep Charts unavailable
  until a separate chart implementation is delivered.
- Show logical records in History with date/category/account filters. A transfer
  appears once; exclude transfer postings and opening balances from report totals.
- Roll child/direct-parent category assignments into parent totals without double
  counting. Retain explicit currencies; never add unlike currencies.
- Calculate all financial totals in the backend from persisted transactions.
- Fetch one aggregate summary for the selected date range and currency.

### Statement imports: subsequent delivery

- Require a selected owned account before upload; retain it through review,
  confirmation and import history. Account/currency mismatches block posting.
- Deliver shared account-bound batches/review in #78, CSV in #79 and PDF in #80.
  Coordinate CSV work with existing #17-#19 instead of building a second importer.
- Accept a documented CSV format using a deliberate file-selection flow; define
  supported PDF layouts/extraction/OCR, limits and retention before PDF enablement.
- Validate content, show a preview and row-level problems, then require the user
  to explicitly confirm before records are created.
- Protect spreadsheet exports from formula injection by neutralizing dangerous
  leading characters in cells intended for spreadsheet display.
- Extract draft rows only. The user can edit/select/reject before atomic,
  idempotent confirmation; repeated uploads and possible transfer matches need
  explicit resolution. Statement summaries/balances are not transaction rows.
- These increments do not block release acceptance for the manual redesign.
  CSV remains part of the original full MVP/beta target; PDF is a separate later
  release. Inert AI shortcuts are included now; functional AI remains later work.

### Engineering quality

- Publish REST/OpenAPI contracts, run validation, tests, linting, type checks, and
  builds in continuous integration.
- Provide documented local setup with Dockerized PostgreSQL and synthetic-only
  development seed data.
- Use accessible labels, usable focus order, sufficient contrast, and clear error
  states for the core screens.

## Explicitly excluded from the MVP

- Bank connections, open-banking integrations, card linking, bank credentials,
  automatic synchronization, and automatic reconciliation.
- Budgets, goals, bill reminders, recurring transactions, subscriptions,
  debt tracking, investment tracking, tax reporting, and multi-currency
  conversion.
- Shared accounts, household ledgers, delegated access, social features, and
  cross-user reporting.
- Receipt scanning/OCR, receipt image storage, voice entry, speech recognition, and
  background monitoring.
- AI/LLM categorization, spending insights, recommendations, forecasts, financial
  advice, model-provider integrations, MCP tools, and Claude skills.
- Production release, payment processing, advertisements, real-financial-data
  demos, and compliance certification.

## Definition of MVP done

The manual redesign milestone (#65-#77) requires entry-first navigation, fixed/
personal hierarchy, permanent currency/account setup, named accounts, correct same-currency
transfers, reporting, accessible recovery states and the contract/migration gate.
Completing the documentation in #64 alone does not satisfy those runtime criteria.

The MVP is ready for a small beta only when an authenticated user can manually
record income and expenses, organize them with categories, review a correct
dashboard and history, import a supported CSV after previewing it, and retain
exclusive access to their records. Core flows must have automated tests,
documented error behavior, and no known critical privacy or authorization gap.
Email/password and Google onboarding, safe account linking, and session restoration
must be verified on supported development builds; Google cancellation or provider
failure must leave email/password sign-in usable. See the
[authentication plan](authentication-plan.md) for the implementation sequence.

## Deferred-feature rules

Future work can be proposed as a separate issue only when it states its data
access, permissions, failure behavior, and user-confirmation point. In particular:

- AI-derived values are drafts, never silently persisted facts.
- Any action proposed by an AI, voice interpreter, receipt extractor, or MCP tool
  must be reviewable and explicitly confirmed by the user before a write.
- A future bank integration requires a new threat model and security review; it
  cannot reuse the MVP's manual-entry assumptions.
