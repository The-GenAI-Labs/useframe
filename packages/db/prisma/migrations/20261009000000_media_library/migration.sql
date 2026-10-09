-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaOrigin" AS ENUM ('UPLOADED', 'GENERATED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "origin" "MediaOrigin" NOT NULL DEFAULT 'UPLOADED',
    "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "title" TEXT,
    "originalKey" TEXT NOT NULL,
    "originalMime" TEXT NOT NULL,
    "originalBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "hasAudio" BOOLEAN,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "dominantColor" TEXT,
    "lqip" TEXT,
    "altText" TEXT,
    "caption" TEXT,
    "decorative" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "suggestedPurposes" JSONB,
    "purpose" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "generation" JSONB,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_projectId_deletedAt_idx" ON "media_assets"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "media_assets_userId_idx" ON "media_assets"("userId");

-- CreateIndex
CREATE INDEX "media_assets_sha256_idx" ON "media_assets"("sha256");

-- CreateIndex
CREATE INDEX "media_assets_status_createdAt_idx" ON "media_assets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "media_assets_deletedAt_idx" ON "media_assets"("deletedAt");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

