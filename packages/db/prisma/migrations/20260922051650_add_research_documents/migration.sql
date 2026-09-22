-- Generated PDF research reports, plus message attachments that reference them.
CREATE TYPE "ResearchDocumentType" AS ENUM ('COMPETITOR_ANALYSIS', 'RESEARCH_RATIONALE');

CREATE TABLE "research_documents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ResearchDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "research_documents_projectId_idx" ON "research_documents"("projectId");

ALTER TABLE "research_documents" ADD CONSTRAINT "research_documents_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD COLUMN "attachments" JSONB;
