-- Auth redesign: collapse email/OAuth login into a single Identity table.
-- No production data to preserve — old auth tables are dropped outright.

-- RenameEnum
ALTER TYPE "OAuthProvider" RENAME TO "AuthProvider";

-- DropForeignKey
ALTER TABLE "auth_accounts" DROP CONSTRAINT IF EXISTS "auth_accounts_userId_fkey";
ALTER TABLE "auth_sessions" DROP CONSTRAINT IF EXISTS "auth_sessions_userId_fkey";
ALTER TABLE "user_credentials" DROP CONSTRAINT IF EXISTS "user_credentials_userId_fkey";
ALTER TABLE "user_identities" DROP CONSTRAINT IF EXISTS "user_identities_userId_fkey";
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_userId_fkey";
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_parentId_fkey";
ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_userId_fkey";
ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_refreshTokenId_fkey";
ALTER TABLE "email_verification_tokens" DROP CONSTRAINT IF EXISTS "email_verification_tokens_userId_fkey";
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_userId_fkey";
ALTER TABLE "phone_otps" DROP CONSTRAINT IF EXISTS "phone_otps_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "auth_accounts";
DROP TABLE IF EXISTS "auth_sessions";
DROP TABLE IF EXISTS "auth_verification_tokens";
DROP TABLE IF EXISTS "user_credentials";
DROP TABLE IF EXISTS "user_identities";
DROP TABLE IF EXISTS "refresh_tokens";
DROP TABLE IF EXISTS "user_sessions";
DROP TABLE IF EXISTS "email_verification_tokens";
DROP TABLE IF EXISTS "password_reset_tokens";
DROP TABLE IF EXISTS "phone_otps";

-- DropIndex (users)
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_phone_key";

-- AlterTable: users — drop login-credential columns, keep profile-only fields
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "email",
  DROP COLUMN IF EXISTS "image",
  DROP COLUMN IF EXISTS "emailVerified",
  DROP COLUMN IF EXISTS "displayName",
  DROP COLUMN IF EXISTS "emailVerifiedAt";

-- CreateTable: identities
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sessions
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: refresh_tokens
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "parentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: magic_link_tokens
CREATE TABLE "magic_link_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: phone_otps (recreated, dropped maxAttempts column)
CREATE TABLE "phone_otps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identities_type_externalId_key" ON "identities"("type", "externalId");
CREATE INDEX "identities_userId_idx" ON "identities"("userId");
CREATE INDEX "identities_email_idx" ON "identities"("email");

CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

CREATE UNIQUE INDEX "magic_link_tokens_tokenHash_key" ON "magic_link_tokens"("tokenHash");
CREATE INDEX "magic_link_tokens_email_idx" ON "magic_link_tokens"("email");
CREATE INDEX "magic_link_tokens_expiresAt_idx" ON "magic_link_tokens"("expiresAt");

CREATE INDEX "phone_otps_userId_idx" ON "phone_otps"("userId");
CREATE INDEX "phone_otps_expiresAt_idx" ON "phone_otps"("expiresAt");

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "refresh_tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "phone_otps" ADD CONSTRAINT "phone_otps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
