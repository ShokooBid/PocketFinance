-- Hand-written. Replaces JWT + rotating refresh tokens with one opaque,
-- hashed session token per device that lives until logout, and folds the
-- single Google identity onto User. Finance rows are never touched.
BEGIN;

-- 1. Google identity moves onto the user that already owns it, same user ID.
ALTER TABLE "User" ADD COLUMN "googleSubject" VARCHAR(255);
UPDATE "User" AS u
SET "googleSubject" = i."providerSubject"
FROM "AuthIdentity" AS i
WHERE i."userId" = u.id AND i.provider = 'google';
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
ALTER TABLE "User" ADD CONSTRAINT "User_googleSubject_nonempty"
    CHECK ("googleSubject" IS NULL OR length(btrim("googleSubject")) > 0);

-- 2. Old credentials cannot be converted (only hashes of different secrets are
-- stored). Every device signs in once more; no ledger data is affected.
DROP TABLE "AuthChallenge";
DROP TABLE "RefreshToken";
DROP TABLE "AuthIdentity";
DROP TYPE "AuthProvider";
DELETE FROM "Session";

-- 3. Session keeps only what revocation and bearer lookup need.
ALTER TABLE "Session" DROP CONSTRAINT "Session_expiry_after_creation";
DROP INDEX "Session_userId_revokedAt_expiresAt_idx";
DROP INDEX "Session_expiresAt_idx";
ALTER TABLE "Session"
    DROP COLUMN "expiresAt",
    DROP COLUMN "revokedAt",
    DROP COLUMN "lastUsedAt",
    DROP COLUMN "reauthenticatedAt",
    DROP COLUMN "updatedAt",
    ADD COLUMN "tokenHash" VARCHAR(64) NOT NULL;
ALTER TABLE "Session" ADD CONSTRAINT "Session_tokenHash_format"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

COMMIT;
