# PocketFinance — Claude Code guide

Personal-finance mobile app (formerly **PocketLedger**, renamed in #110). Expo /
React Native client + one Fastify REST API + PostgreSQL via Prisma. Pre-release
portfolio/learning project; use synthetic data only.

@AGENTS.md

## Architecture in one screen

```text
apps/mobile (Expo Router, TS) --HTTPS/JSON /v1--> apps/api (Fastify, Zod) --> PostgreSQL (Prisma + SQL)
```

- **Single backend, not microservices.** One API process, one database. Do not
  split services or add a message bus.
- npm workspaces: `apps/api`, `apps/mobile`. There is **no shared package**; it
  was removed deliberately. Mobile keeps its own Zod response schemas. It imports
  only `apps/api/src/categories/catalog.v1.ts`, which is framework-free.
- API modules follow `contracts.ts` (Zod) → `routes.ts` → `service.ts`
  (Prisma). Services are injected into `buildApp()` in `apps/api/src/app.ts`.
- Data integrity is enforced in **both** services and SQL (triggers, CHECKs,
  composite owner FKs in hand-written migrations). The owner row lock is
  `lockFinanceOwner()`.

Details: [docs/ai-context/ARCHITECTURE.md](docs/ai-context/ARCHITECTURE.md).

## Non-negotiable constraints

- Money is **integer minor units**. Never use floats. Never convert or add
  amounts in different currencies.
- Currency is chosen once per user and is permanent. A transaction's currency
  comes from `Account.currency`, and write bodies never carry currency.
- Ownership comes from the authenticated session. Never trust a client
  `userId`, and scope every query by owner.
- Transaction dates are `YYYY-MM-DD` calendar dates. Don't shift them through
  timezones.
- A transfer is one aggregate with two balanced postings. Transfers and opening
  balances are excluded from income/expense totals.
- Errors use the envelope `{ error: { code, message, requestId } }`. Never leak
  stack traces or SQL.
- Mobile tokens live only in Expo SecureStore. `EXPO_PUBLIC_*` values are
  public.
- AI, CSV, or voice output must be an editable draft and must never be saved
  without explicit user confirmation
  ([docs/architecture.md](docs/architecture.md#ai-and-automation-boundary)).
- Breaking `/v1` changes require deploying the matching API and mobile builds
  together (pre-release policy).
- Preserve the minimal, mobile-first purple/pink design and use tokens from
  `apps/mobile/src/theme.ts`.

## Conventions

- Strict TypeScript (`tsconfig.base.json`: `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`). Use inline `type` imports (ESLint rule).
- Prettier: double quotes, semicolons, no trailing commas. `docs/*` is
  Prettier-ignored except `docs/mobile-redesign/`. Root Markdown such as this
  file **is** checked.
- Keep business logic in testable modules (`*-data.ts`, `use-*.ts`, services),
  separate from rendering.
- Branches are named like `feat|fix|docs|chore/issue-<n>-<slug>`. Commits use
  `type: description (#n)`. Open PRs against `main` and squash-merge them.

## Commands (run from repo root)

```sh
npm ci && npm run db:generate          # install + Prisma Client (required before typecheck/build)
docker compose up -d db                # local PostgreSQL 16
npm run db:deploy && npm run categories:init
npm run dev:api                        # API on 127.0.0.1:3000
npm run dev:mobile                     # Expo; demo works on web with no backend
npm run format:check && npm run lint && npm run typecheck && npm run test
npm run test:integration:local         # API + mobile integration vs disposable schemas
npm run build --workspace=@pocketfinance/api
```

Focused workspace tests: append `--workspace=@pocketfinance/api` (Vitest) or
`--workspace=@pocketfinance/mobile` (Jest). There is **no Playwright/E2E suite**
in the repo.

## Claude Code setup in this repo

- `.claude/rules/` holds path-scoped rules for `api`, `database` (Prisma), and
  `mobile`.
- `.claude/skills/ui-check` is invoked as `/ui-check <flow>`. It drives the web
  demo with Playwright MCP, configured in `.mcp.json`.
- `.claude/settings.json` sets the read-only check allowlist and denies reading
  `.env`. Its hook blocks DB-destroying commands.
- The `.agents/skills/*` skills referenced by AGENTS.md are also installed as
  user skills: `/deep-task-planning` and `/solid-code-quality`.

## Further reading

- [docs/ai-context/](docs/ai-context/): overview, architecture, feature status,
  decisions, workflow, open questions, and the migration report.
- [DEVELOPMENT.md](DEVELOPMENT.md) and [CONTRIBUTING.md](CONTRIBUTING.md):
  setup, verification, and PR process.
- [docs/architecture.md](docs/architecture.md),
  [docs/mobile-redesign/](docs/mobile-redesign/README.md), and
  [docs/threat-model.md](docs/threat-model.md): the authoritative decision
  records.
