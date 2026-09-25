CREATE TYPE "ReplicationStatus" AS ENUM ('QUEUED', 'RENDERING', 'EXTRACTING', 'ANALYZING', 'GENERATING', 'READY', 'FAILED');

CREATE TABLE "replications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "ReplicationStatus" NOT NULL DEFAULT 'QUEUED',
    "tier" "GenerationTier" NOT NULL DEFAULT 'PAID',
    "screenshotKey" TEXT,
    "designTokens" JSONB,
    "extractedContent" JSONB,
    "designBrief" JSONB,
    "snapshot" JSONB,
    "freeCorrectionUsed" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "replications_slug_key" ON "replications"("slug");
CREATE INDEX "replications_userId_idx" ON "replications"("userId");
CREATE INDEX "replications_status_idx" ON "replications"("status");

ALTER TABLE "replications" ADD CONSTRAINT "replications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "replicationId" TEXT;
CREATE INDEX IF NOT EXISTS "conversations_replicationId_idx" ON "conversations"("replicationId");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_replicationId_fkey" FOREIGN KEY ("replicationId") REFERENCES "replications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" DROP COLUMN IF EXISTS "replicationSourceUrl";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "replicationFreeCorrectionUsed";
