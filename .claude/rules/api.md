---
paths:
  - "apps/api/src/**"
  - "apps/api/tests/**"
---

# API rules (apps/api)

- Follow the module shape `contracts.ts` (Zod) → `routes.ts` → `service.ts`, and
  register new services through `buildApp()` options in `src/app.ts`.
- Request schemas are `z.strictObject`. Every route declares response schemas,
  including the shared error schemas, so OpenAPI stays accurate. Run
  `npm run openapi --workspace=@pocketfinance/api` after changing a contract.
- Throw `ApiError(status, CODE, safeMessage)`. Never return raw errors, SQL, or
  stack traces. Use 404 for foreign or missing resources, which avoids leaking
  existence, and 422 for business-rule failures.
- Take the user ID only from `request.principal`, and scope every query by owner.
  Run finance writes inside `db.$transaction`, and call `lockFinanceOwner()`
  before reading state that the write depends on.
- Money values are positive integers in minor units with an explicit direction.
  Never parse or emit floats for amounts.
- Mirror invariants in SQL when the database can enforce them. See
  `.claude/rules/database.md`.
- Tests: unit tests go in `tests/*.test.ts`. Authorization and DB behaviour go
  in `tests/integration/*.test.ts` and must include a second-user (cross-owner)
  case for every new resource route. Use synthetic data only.
