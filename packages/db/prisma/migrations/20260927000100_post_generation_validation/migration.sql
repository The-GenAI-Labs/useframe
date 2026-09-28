-- CreateEnum
CREATE TYPE "ValidationPipeline" AS ENUM ('MAIN', 'REPLICATE');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED_MAX_ITERATIONS', 'ERROR');

-- AlterTable
ALTER TABLE "project_versions" ADD COLUMN     "nextFiles" JSONB,
ADD COLUMN     "triggeredBy" TEXT,
ADD COLUMN     "validationFixKey" TEXT;

-- AlterTable
ALTER TABLE "replications" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "ValidationRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startVersionId" TEXT NOT NULL,
    "pipeline" "ValidationPipeline" NOT NULL,
    "tier" INTEGER NOT NULL,
    "status" "ValidationStatus" NOT NULL DEFAULT 'QUEUED',
    "isFreeTier" BOOLEAN NOT NULL,
    "threshold" INTEGER NOT NULL,
    "maxIterations" INTEGER NOT NULL,
    "iterationCount" INTEGER NOT NULL DEFAULT 0,
    "finalScore" INTEGER,
    "discrepancies" JSONB,
    "originalScreenshotKeys" JSONB,
    "renderedScreenshotKeys" JSONB,
    "signals" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "ValidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIteration" (
    "id" TEXT NOT NULL,
    "validationRunId" TEXT NOT NULL,
    "iterationNumber" INTEGER NOT NULL,
    "resultingVersionId" TEXT,
    "score" INTEGER NOT NULL,
    "discrepancies" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationIteration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValidationRun_projectId_idx" ON "ValidationRun"("projectId");

-- CreateIndex
CREATE INDEX "ValidationRun_status_idx" ON "ValidationRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationRun_startVersionId_pipeline_key" ON "ValidationRun"("startVersionId", "pipeline");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationIteration_validationRunId_iterationNumber_key" ON "ValidationIteration"("validationRunId", "iterationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "project_versions_validationFixKey_key" ON "project_versions"("validationFixKey");

-- CreateIndex
CREATE UNIQUE INDEX "replications_projectId_key" ON "replications"("projectId");

-- AddForeignKey
ALTER TABLE "replications" ADD CONSTRAINT "replications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationRun" ADD CONSTRAINT "ValidationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationRun" ADD CONSTRAINT "ValidationRun_startVersionId_fkey" FOREIGN KEY ("startVersionId") REFERENCES "project_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIteration" ADD CONSTRAINT "ValidationIteration_validationRunId_fkey" FOREIGN KEY ("validationRunId") REFERENCES "ValidationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
