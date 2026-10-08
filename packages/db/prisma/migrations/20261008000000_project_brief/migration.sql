-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('DRAFT', 'RESOLVING', 'AWAITING_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "BriefMode" AS ENUM ('QUICK', 'FULL');

-- AlterTable
ALTER TABLE "project_versions" ADD COLUMN     "briefRevisionId" TEXT;

-- CreateTable
CREATE TABLE "project_briefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "BriefStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "BriefMode" NOT NULL DEFAULT 'QUICK',
    "currentStep" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "resolution" JSONB NOT NULL DEFAULT '{}',
    "catalogVersion" INTEGER NOT NULL,
    "lastPrefillAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "project_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_revisions" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "meta" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "brief_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_uploads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "data" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "brief_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_briefs_projectId_key" ON "project_briefs"("projectId");

-- CreateIndex
CREATE INDEX "project_briefs_userId_status_idx" ON "project_briefs"("userId", "status");

-- CreateIndex
CREATE INDEX "project_briefs_userId_projectId_idx" ON "project_briefs"("userId", "projectId");

-- CreateIndex
CREATE INDEX "project_briefs_projectId_updatedAt_idx" ON "project_briefs"("projectId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "brief_revisions_briefId_version_key" ON "brief_revisions"("briefId", "version");

-- CreateIndex
CREATE INDEX "brief_uploads_briefId_idx" ON "brief_uploads"("briefId");

-- CreateIndex
CREATE INDEX "brief_uploads_userId_createdAt_idx" ON "brief_uploads"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "brief_uploads_expiresAt_idx" ON "brief_uploads"("expiresAt");

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_briefRevisionId_fkey" FOREIGN KEY ("briefRevisionId") REFERENCES "brief_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_revisions" ADD CONSTRAINT "brief_revisions_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "project_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_uploads" ADD CONSTRAINT "brief_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_uploads" ADD CONSTRAINT "brief_uploads_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "project_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
