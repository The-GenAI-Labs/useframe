-- CreateEnum
CREATE TYPE "MediaJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_USER', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaJobMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "project_versions" ADD COLUMN     "blueprint" JSONB;

-- CreateTable
CREATE TABLE "media_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "MediaJobMode" NOT NULL,
    "status" "MediaJobStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "checkpoint" TEXT,
    "checkpointExpiresAt" TIMESTAMP(3),
    "scope" JSONB NOT NULL,
    "mediaBrief" JSONB,
    "plan" JSONB,
    "concepts" JSONB,
    "state" JSONB NOT NULL DEFAULT '{}',
    "bindings" JSONB,
    "creditsReserved" INTEGER NOT NULL DEFAULT 0,
    "creditsRefunded" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "versionId" TEXT,
    "compiledAt" TIMESTAMP(3),
    "compiledBindings" JSONB,
    "resultVersionId" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_generations" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "requestKey" TEXT NOT NULL,
    "providerTaskId" TEXT,
    "status" TEXT NOT NULL,
    "promptText" TEXT,
    "inputAssetIds" JSONB,
    "outputAssetId" TEXT,
    "costUsd" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_jobs_projectId_status_idx" ON "media_jobs"("projectId", "status");

-- CreateIndex
CREATE INDEX "media_jobs_userId_status_idx" ON "media_jobs"("userId", "status");

-- CreateIndex
CREATE INDEX "media_jobs_checkpointExpiresAt_idx" ON "media_jobs"("checkpointExpiresAt");

-- CreateIndex
CREATE INDEX "media_jobs_status_updatedAt_idx" ON "media_jobs"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "media_generations_requestKey_key" ON "media_generations"("requestKey");

-- CreateIndex
CREATE INDEX "media_generations_jobId_idx" ON "media_generations"("jobId");

-- CreateIndex
CREATE INDEX "media_generations_createdAt_idx" ON "media_generations"("createdAt");

-- AddForeignKey
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_generations" ADD CONSTRAINT "media_generations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "media_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One refund per media item key; Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "credit_transactions_media_refund_key"
  ON "credit_transactions"("refId")
  WHERE "type" = 'REFUND' AND "refType" = 'MEDIA';
