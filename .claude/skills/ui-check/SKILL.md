---
name: ui-check
description: Launch PocketFinance locally and drive the web demo with the Playwright MCP browser to reproduce or verify a UI behaviour, take screenshots and report findings. Use when asked to run the app, check a screen or flow in the browser, reproduce a UI bug, or "use Playwright to test the app".
argument-hint: <flow or bug to check, e.g. "edit amount from History">
---

# PocketFinance UI check

Reproduce or verify `$ARGUMENTS` in the running app and report the evidence.

## Facts to respect

- The **web build supports demo mode only**. `apps/mobile/src/app/sign-in.tsx`
  disables sign-in when `Platform.OS === "web"`. Browser checks therefore run
  against the in-memory demo and **never reach the API**. Don't try to sign in
  on web, and never type real credentials.
- Live-API behaviour gets checked separately (step 4) or on a native
  development build, which the user has to do manually.
- Use synthetic data only.

## Steps

1. **Start the web app** as a background command from the repo root:
   `npm run dev --workspace=@pocketfinance/mobile -- --web`. Wait until Metro
   reports the web URL (usually `http://localhost:8081`). Reuse a server that is
   already running instead of starting a second one.
2. **Open the demo** with the Playwright MCP tools (`browser_navigate`, then
   `browser_snapshot`). Choose **Explore demo screens without signing in**.
   Complete setup as a new demo user would: confirm a currency, then create an
   account, adding a second account if the flow needs transfers.
3. **Drive the flow** in `$ARGUMENTS`. Prefer `browser_snapshot` (the
   accessibility tree) to find elements by role or label, and use screenshots as
   evidence at key states. Check the browser console messages for React
   warnings and errors.
4. **API, if relevant.** If the question involves server behaviour and the user
   has the API running (`npm run dev:api`), check `GET http://127.0.0.1:3000/health`.
   Otherwise point to the relevant integration tests (`apps/api/tests/integration/`)
   rather than guessing. Don't start Docker or modify the database without asking.
5. **Report:**
   - What you did.
   - Expected versus actual behaviour.
   - Screenshot file paths. The Playwright output directory is set in
     `.mcp.json`, outside the repo.
   - Console errors.
   - The likely source files involved, with links.

   Keep observations separate from hypotheses. Don't fix code unless the user
   asked for a fix.

6. **Clean up.** Stop the dev servers you started (and only those). Confirm that
   `git status` shows no new files from the run.
