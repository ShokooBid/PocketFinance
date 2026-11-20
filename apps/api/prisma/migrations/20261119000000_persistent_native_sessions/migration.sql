BEGIN;

-- NULL represents a persistent session or refresh token. Existing deadlines
-- stay in place until the server validates and upgrades a legacy session.
ALTER TABLE "Session" ALTER COLUMN "expiresAt" DROP NOT NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "expiresAt" DROP NOT NULL;

COMMIT;
