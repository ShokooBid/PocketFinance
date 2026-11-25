# Development workflow

Full setup is in [DEVELOPMENT.md](../../DEVELOPMENT.md) and the PR process is in
[CONTRIBUTING.md](../../CONTRIBUTING.md). This page is the condensed checklist
for working with Claude Code.

## Environment

- Windows 11 is the primary dev machine, with both PowerShell and Git Bash
  available. Commands in the repo docs are cross-platform npm scripts.
- Node 22.19.0 (`.nvmrc`) and npm 10.9.3. CI enforces the npm version.
- Root `.env` (git-ignored, copied from `.env.example`) holds the API and Docker
  values. `apps/mobile/.env.local` holds public `EXPO_PUBLIC_*` values. **Never
  read secrets from these files into docs or output.**

## Everyday commands (repo root)

| Task                       | Command                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| Install                    | `npm ci` then `npm run db:generate`                                         |
| Start DB                   | `docker compose up -d db` (stop: `docker compose stop db`; **never** `down --volumes` without intent) |
| Apply migrations           | `npm run db:validate && npm run db:deploy && npm run categories:init`       |
| New migration (dev)        | `npm run db:migrate` (Prisma `migrate dev`). Review and hand-edit the SQL for invariants. |
| API (watch)                | `npm run dev:api` (sets `NODE_ENV=development`, loads `.env`)              |
| Mobile                     | `npm run dev:mobile`; demo on web: `npm run dev --workspace=@pocketfinance/mobile -- --web`; Expo Go: `-- --go` |
| Android dev build          | `cd apps/mobile && npx expo run:android --device`                           |
| OpenAPI                    | `npm run openapi --workspace=@pocketfinance/api` → `apps/api/dist/openapi.json` |
| Category icons             | `npm run icons:generate`                                                    |

## Verification (matches CI `quality` job)

```sh
npm run format:check
npm run lint
npm run typecheck          # mobile runs `expo customize tsconfig.json` first
npm run test               # API Vitest + mobile Jest (NODE_ENV=test forced)
npm run test:integration:local   # needs local DB; uses DATABASE_URL as TEST_DATABASE_URL
npm run build --workspace=@pocketfinance/api
```

- Scope checks to the affected workspace first (`--workspace=@pocketfinance/api`
  or `@pocketfinance/mobile`), then expand. AGENTS.md requires reporting which
  checks ran.
- Run one mobile test file with
  `npm run test --workspace=@pocketfinance/mobile -- --runTestsByPath tests/<file>`.
  DEVELOPMENT.md lists focused bundles for entry/History and Reports.
- If Expo's typecheck stalls, run
  `node node_modules/typescript/bin/tsc -p apps/mobile/tsconfig.json --noEmit`.
- **Formatting scope:** `docs/*` is Prettier-ignored except
  `docs/mobile-redesign/`. Root Markdown (README, CLAUDE.md, …) and all code are
  checked.
- New API integration tests go in `apps/api/tests/integration/**/*.test.ts`.
  Mobile integration tests are `apps/mobile/tests/integration/*.integration.ts`.

## Git and PR conventions

- Each issue gets its own branch, named `feat|fix|docs|chore/issue-<n>-<slug>`,
  created from an up-to-date `main`.
- Commit messages follow `type(scope?): description (#n)`.
- Stage explicit paths. Run `git diff --cached --check` before committing.
- Fill in the PR template (outcome, `Closes #n` or `Refs #n`, validation actually
  run, security impact). Squash-merge.
- Branch protection is unavailable on the current plan, so a green `quality`
  check has to be enforced manually.
- Dependabot opens weekly grouped PRs. Never auto-merge them. For Expo stack
  upgrades, run `npx expo install --check` and test on a device.

## Project-local skills

- `.agents/skills/deep-task-planning/SKILL.md` is the investigation and planning
  template, used when the user asks for `$deep-task-planning`. In Claude Code,
  use `/deep-task-planning`.
- `.agents/skills/solid-code-quality/SKILL.md` covers design reviews and
  refactors. In Claude Code, use `/solid-code-quality`.

The originals stay in place for Codex. The Claude copies live at user level in
`~/.claude/skills/`.

## Claude Code configuration (project level)

| Path                                  | Purpose                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.claude/settings.json`               | Allows read-only checks (`git status/diff/log`, lint, typecheck, test, db:validate/status, openapi) and denies `Read` of `.env`, `local-data/`, `backups/` |
| `.claude/hooks/guard-destructive.mjs` | PreToolUse hook on Bash and PowerShell. Blocks `docker compose down -v`, `docker volume rm/prune`, `prisma migrate reset`, `--force-reset`, `dropdb`/`DROP DATABASE/SCHEMA`, and `git clean -x` |
| `.claude/rules/{api,database,mobile}.md` | Rules that load only when working under the matching paths                              |
| `.claude/skills/ui-check/`            | `/ui-check <flow>`: start the web demo, drive it with Playwright MCP, report with screenshots |
| `.mcp.json`                           | Playwright MCP pinned to `@playwright/mcp@0.0.85`. Screenshots go to `%TEMP%/pocketfinance-playwright`. Claude asks for approval on first use. |

Personal preferences live in `~/.claude/CLAUDE.md`, not in this repo.

## Ignored local folders (do not commit or depend on)

These folders are personal, git-ignored, and not authoritative:

- `local-docs/`: personal issue walkthroughs and plans
- `local-data/`
- `.brag/`
- `.playwright-mcp/`
- `artifacts/`
- `coverage/`
- `dist/`
