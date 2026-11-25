# Open questions

These are questions for the project owner. Claude Code could not answer them
from the repository. Record answers here, or in the relevant authoritative doc,
then delete the question.

## Conflicts between the brief and the repo

1. **Playwright / E2E.** The migration brief lists Playwright for E2E, but the
   repo has no Playwright dependency, config, or tests. The only trace is the
   ignored `.playwright-mcp/` console logs from 2026-11-13 and 2026-11-17, which
   suggest ad-hoc browser checks of the web demo. Is an E2E suite planned (for
   example under #77, device acceptance)? If so, should it target the web demo,
   or native via Maestro or Detox?
2. **AI scope vs MVP scope.** The brief names NL entry, voice, AI
   categorization, and spending explanations as potential features.
   `docs/mvp-scope.md` lists all of them as _explicitly excluded from the MVP_.
   Has that decision changed? If so, which comes first, and which model
   provider?
3. **Project name.** Should "PocketLedger" stay anywhere, for example in the
   GitHub repo name or a portfolio, or is PocketFinance final everywhere? The
   Git remote already points to `ShokooBid/PocketFinance`.

## Doc vs code discrepancies

On 2026-11-25 the docs were corrected to match the code. The inert AI entry
points are marked not implemented, the README period-comparison claim is
removed, the stale mvp-scope status is fixed, and the #137 UX changes are
documented. One item remains because the fix is in source code:

6. **Stale API description.** The OpenAPI description on `GET /v1/accounts/:id`
   (`apps/api/src/accounts/routes.ts`) still says "Until #69 links postings,
   balances contain only the opening baseline", but postings are now linked.
   The fix is a one-line string change in route code, so it changes the
   generated OpenAPI. Make it in a small chore PR.
7. **Inert AI entry points (#76).** The docs now say these are planned. Are they
   still wanted before functional AI, or should #76 be folded into the later AI
   work?

## Missing decisions

8. **Deployment target.** There is no API Dockerfile and no hosting config, and
   the EAS `production` profile is empty. Is any deployment planned (for
   example Fly.io, Render, Railway, or a VPS, plus managed PostgreSQL)? The
   threat model requires a shared rate limiter, trusted-proxy configuration, and
   a backup and restore plan before then.
9. **Shared contracts.** The mobile app duplicates the API's Zod schemas. Is
   this accepted long-term? Or should a `packages/contracts` workspace (or
   OpenAPI-generated client types) be introduced when import and AI work adds
   more endpoints?
10. **Google linking UI and all-device sign-out.** The API supports both
    (#16), but mobile appears to expose only Sign out. Is the UI still planned?
11. **Sign in with Apple.** Required before any iOS submission (#22). Is iOS
    distribution a goal?
12. **CSV import.** Which bank formats come first, and should it reuse the
    existing `Import` model as is? Note that issues #17–#19 are older CSV
    issues to coordinate with #78–#79.
13. **Issue #137 (current branch).** The branch name mentions "currency account
    edit". Is any work beyond commit `3661591` still pending on it?
