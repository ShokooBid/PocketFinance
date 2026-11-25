---
paths:
  - "apps/mobile/**"
---

# Mobile rules (apps/mobile)

- Use tokens from `src/theme.ts` for color, spacing, radius, and 48px touch
  targets. Keep the minimal purple/pink look and don't hard-code new colors.
- Put business logic and state in testable modules (`*-data.ts`, `use-*.ts`,
  contexts), separate from rendering.
- Every API response passes through `Transport` with a Zod schema. Surface
  errors as `ClientFailure` kinds with fixed messages, and never show raw
  responses or exceptions.
- Every data feature has both a live source and an in-memory demo source. Keep
  them behaviourally consistent, and make sure demo mode makes no network calls.
- Store tokens only through `auth/secure-store.ts` (SecureStore). Treat
  `EXPO_PUBLIC_*` values as public.
- Web and Expo Go support the **demo only**. Real sign-in and Google need a
  development build.
- Give interactive elements accessibility labels. Validate route and deep-link
  params at runtime (`navigation.ts`).
- Tests: Jest with React Native Testing Library under `tests/`. When changing
  the shared editor, History, or the date picker, run the focused bundles in
  DEVELOPMENT.md.
