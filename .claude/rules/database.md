---
paths:
  - "apps/api/prisma/**"
---

# Database and migration rules

- Never edit a migration that has already been committed or applied, because
  Prisma checksums it. Add a new one with `npm run db:migrate`, then review the
  generated SQL.
- Many invariants live only in hand-written SQL inside migrations: triggers,
  CHECKs, partial unique indexes, and composite `(id, userId)` owner FKs. Read
  the relevant earlier migrations before changing a model, and keep those guards
  intact.
- Migrations must apply from an empty database. The integration suites deploy
  from zero into a disposable schema
  (`npm run test:integration:local`).
- Run `npm run db:generate` after schema changes. Commit the schema and the
  migration SQL, never `src/generated/prisma/`.
- Do not run destructive resets against the local database. The project hook
  blocks `prisma migrate reset` and `docker compose down --volumes`.
- Changes to the shared category catalog (`categories/catalog.v1.ts`) are
  deliberate deployment changes. `npm run categories:init` rejects drift.
