-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PageType" ADD VALUE 'BLOG';
ALTER TYPE "PageType" ADD VALUE 'FAQ';
ALTER TYPE "PageType" ADD VALUE 'CHANGELOG';

-- AlterEnum
ALTER TYPE "ScanType" ADD VALUE 'STYLE_REFERENCE';

-- AlterTable
ALTER TABLE "research_reports" ADD COLUMN     "generationSpec" JSONB,
ADD COLUMN     "intakeId" TEXT,
ADD COLUMN     "masterPrompt" TEXT,
ADD COLUMN     "specVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "styleTagKeys" TEXT[];

-- CreateTable
CREATE TABLE "research_intakes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rawIdea" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "classifiedNiche" "NicheCategory",
    "classificationConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_tags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "designTokens" JSONB NOT NULL,
    "exemplarScanIds" TEXT[],
    "exemplarUrls" TEXT[],
    "requiresCapability" TEXT,
    "compatibleWith" TEXT[],
    "avoidPatterns" TEXT[],
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_directives" (
    "id" TEXT NOT NULL,
    "niche" "NicheCategory" NOT NULL,
    "modelTarget" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "referenceProducts" TEXT[],
    "avoidPatterns" TEXT[],
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_directives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_exemplars" (
    "id" TEXT NOT NULL,
    "sectionType" TEXT NOT NULL,
    "styleTagCombo" TEXT[],
    "templatePath" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "designTokens" JSONB NOT NULL,
    "screenshotKey" TEXT NOT NULL,
    "linkedFindingIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "component_exemplars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_intakes_projectId_key" ON "research_intakes"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "style_tags_key_key" ON "style_tags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "style_directives_niche_modelTarget_key" ON "style_directives"("niche", "modelTarget");

-- CreateIndex
CREATE INDEX "component_exemplars_sectionType_idx" ON "component_exemplars"("sectionType");

-- AddForeignKey
ALTER TABLE "research_intakes" ADD CONSTRAINT "research_intakes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

