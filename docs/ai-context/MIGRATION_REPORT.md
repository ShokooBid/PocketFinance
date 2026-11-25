# Migration report: ChatGPT/Codex to Claude Code

- Date: 2026-11-25
- Branch: `fix/issue-137-currency-account-edit` at `3661591`
- Working tree: clean before the work started

## What was investigated

- **Repository structure:** all 312 tracked files, the root configuration
  (`package.json`, `tsconfig.base.json`, ESLint, Prettier and its ignore file,
  `compose.yaml`, `.env.example` placeholders only, `.nvmrc`), and
  `.github/workflows/quality.yml`, `dependabot.yml`, the PR template, and
  CODEOWNERS.
- **API:** `app.ts`, `index.ts`, `config.ts`, `errors.ts`, `database.ts`, every
  `routes.ts` (endpoint inventory), and the transactions, accounts, dashboard,
  history, and preferences contracts. Also the transaction service,
  `lockFinanceOwner`, `schema.prisma`, the list of 20 migrations, and a count of
  SQL triggers per migration.
- **Mobile:** the manifests, `app.json`, `app.config.ts`, `eas.json`,
  `.env.example`, router layouts, the import and categories screens, `theme.ts`,
  `auth/transport.ts`, `google.ts` and `google.native.ts`, and searches for
  AI, voice, charts, and comparison features.
- **Tests:** the Vitest and Jest configs, the disposable-schema harness, and
  cross-workspace imports in the integration tests.
- **Existing docs:** README, DEVELOPMENT, CONTRIBUTING, SECURITY, AGENTS.md,
  `docs/architecture.md`, `mvp-scope.md`, `authentication-plan.md`,
  `threat-model.md`, and `docs/mobile-redesign/README.md`. Only the headings of
  `ux.md`, `finance-contracts.md`, and `verification.md` were scanned, plus
  their AI and statements sections.
- **Git history:** the `main` log back to #93, the PocketLedger rename commit,
  and searches for Playwright and #76.

**Not done:**

- No tests, builds, or the app were run. This task changes documentation only;
  the only check run was a Prettier check on `CLAUDE.md`.
- The individual SQL migration bodies were not read line by line.
- Every mobile component was not read.
- GitHub issues were not fetched, because the repository is private.

## Key findings

1. The existing documentation is **extensive and mostly accurate**, and it
   remains authoritative. The new `docs/ai-context/` files index and condense it
   rather than replace it.
2. The architecture is a **single Fastify API and one PostgreSQL database**,
   which confirms the brief's constraint. Integrity is enforced twice, by the
   services and by SQL triggers and composite owner FKs.
3. The brief and the repository disagree in three places:
   - **Playwright is not used.** There are no E2E tests.
   - **The AI features are excluded from the MVP** in `mvp-scope.md`. They are
     not merely unimplemented.
   - The brief's repo name, **PocketLedger**, is outdated. The project was
     renamed PocketFinance in #110.
4. The docs disagree with the code in four places:
   - The "inert AI entry points" don't exist.
   - The README's period-comparison claim is not implemented.
   - An OpenAPI description on accounts is stale.
   - The mvp-scope status line is stale.

   **Update 2026-11-25:** the three document mismatches were corrected in
   README, `mvp-scope.md`, `architecture.md` and `mobile-redesign/README.md`.
   `ux.md` now also documents the #137 behaviour: the currency dropdown, the
   account-edit scroll and save-error notice, and the transfer "Clear
   selection" option. The stale OpenAPI string remains, because fixing it means
   changing source code ([OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) #6).
5. **There is no shared types package, by deliberate decision.** Mobile
   duplicates the Zod schemas and imports only the category catalog from the API.
   The mobile integration tests and the CI OpenAPI artifact guard against drift.
6. **No deployment exists.** There is no Dockerfile, the EAS production profile
   is empty, and the rate limiter is process-local.

## Files created

| File                                       | Purpose                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| `CLAUDE.md`                                | Concise always-loaded guide. Imports `AGENTS.md` via `@AGENTS.md`. |
| `docs/ai-context/PROJECT_OVERVIEW.md`      | Product, name history, stack, design tokens                |
| `docs/ai-context/ARCHITECTURE.md`          | Layout, endpoint table, data model, mobile structure, type sharing |
| `docs/ai-context/FEATURE_STATUS.md`        | Done / partial / planned / excluded, with evidence         |
| `docs/ai-context/TECHNICAL_DECISIONS.md`   | Decision index with sources                                |
| `docs/ai-context/DEVELOPMENT_WORKFLOW.md`  | Commands, checks, Git conventions                          |
| `docs/ai-context/OPEN_QUESTIONS.md`        | Questions for the owner                                    |
| `docs/ai-context/MIGRATION_REPORT.md`      | This report                                                |

No existing file was modified or deleted. No source code, package files, or
dependencies were changed, and nothing was committed. `docs/ai-context/` falls
under the `docs/*` Prettier ignore, so it is not format-checked. `CLAUDE.md` is
checked and was verified with Prettier.

## Recommended next investigations

1. Read the SQL bodies of the migrations, especially the atomic transfers,
   category snapshot locks, and opening-date edit migrations, before the next
   schema change.
2. Run the full verification suite once (`format:check`, `lint`, `typecheck`,
   `test`, `test:integration:local`) to establish a baseline under Claude Code.
3. Fix the stale accounts OpenAPI description (OPEN_QUESTIONS #6) in a small
   chore PR. The document mismatches were already corrected on 2026-11-25.
4. Before starting CSV import (#78/#79), review `finance-contracts.md` "Later
   statement contracts", the `Import` model, and the threat-model CSV rows.
5. Before any AI work, update `mvp-scope.md` and `threat-model.md` first, because
   both currently exclude AI and require a new review.
