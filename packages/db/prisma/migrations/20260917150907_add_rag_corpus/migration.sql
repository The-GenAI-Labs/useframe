-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "project_versions" ADD COLUMN     "designBrief" JSONB;

-- CreateTable
CREATE TABLE "research_findings" (
    "id" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "paper" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "appliesTo" TEXT[],
    "audience" TEXT[],
    "decision" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "contextHeader" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_relations" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,

    CONSTRAINT "finding_relations_pkey" PRIMARY KEY ("fromId","toId")
);

-- CreateTable
CREATE TABLE "domain_patterns" (
    "domain" TEXT NOT NULL,
    "typicalSections" TEXT[],
    "toneRange" TEXT[],
    "conversionPattern" TEXT NOT NULL,
    "commonObjections" TEXT[],
    "proofTypes" TEXT[],

    CONSTRAINT "domain_patterns_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "audience_modifiers" (
    "audience" TEXT NOT NULL,
    "modifies" JSONB NOT NULL,

    CONSTRAINT "audience_modifiers_pkey" PRIMARY KEY ("audience")
);

-- CreateTable
CREATE TABLE "generation_outcomes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "userEdits" JSONB,
    "score" INTEGER,
    "deployed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_findings_field_idx" ON "research_findings"("field");

-- CreateIndex
CREATE INDEX "research_findings_decision_idx" ON "research_findings"("decision");

-- CreateIndex
CREATE INDEX "generation_outcomes_projectId_idx" ON "generation_outcomes"("projectId");
