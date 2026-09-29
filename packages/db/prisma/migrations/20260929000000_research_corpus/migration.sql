BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DRAFT', 'VERIFIED', 'RETIRED');

-- CreateEnum
CREATE TYPE "FindingRelationType" AS ENUM ('SUPPORTS', 'CONFLICTS', 'REFINES', 'OFTEN_CITED_TOGETHER');

-- CreateEnum
CREATE TYPE "DecisionArea" AS ENUM ('COLOR', 'TYPOGRAPHY', 'LAYOUT', 'CONVERSION', 'TRUST_SOCIAL_PROOF', 'ACCESSIBILITY', 'MOTION', 'COPY_TONE', 'IMAGERY');

-- CreateEnum
CREATE TYPE "IngestionOutcome" AS ENUM ('SUCCESS', 'SKIPPED_UNCHANGED', 'SKIPPED_STALE_GENERATION', 'SKIPPED_OVERWRITTEN', 'INVALID', 'RETIRED', 'FAILED');

-- AlterTable
ALTER TABLE "research_findings" ADD COLUMN     "appliesWhen" TEXT,
ADD COLUMN     "category" "ResearchCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "confidenceScore" DOUBLE PRECISION,
ADD COLUMN     "contentHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "effectSize" TEXT,
ADD COLUMN     "embeddingHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gcsGeneration" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gcsObjectKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reuseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchVector" tsvector,
ADD COLUMN     "slug" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceDocumentId" TEXT,
ADD COLUMN     "sourceExcerpt" TEXT,
ADD COLUMN     "sourceLocator" TEXT,
ADD COLUMN     "statement" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "FindingStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ALTER COLUMN "claim" SET DEFAULT '',
ALTER COLUMN "paper" SET DEFAULT '',
ALTER COLUMN "field" SET DEFAULT '',
ALTER COLUMN "decision" SET DEFAULT '',
ALTER COLUMN "options" SET DEFAULT '[]',
ALTER COLUMN "contextHeader" SET DEFAULT '';

-- AlterTable
ALTER TABLE "finding_relations" DROP CONSTRAINT "finding_relations_pkey",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "relationType" "FindingRelationType" NOT NULL DEFAULT 'SUPPORTS',
ALTER COLUMN "relation" SET DEFAULT '';

-- Preserve legacy rows without asserting that their free-text references are verified sources.
UPDATE research_findings SET slug = 'legacy-' || id, title = "contextHeader", statement = claim,
  "gcsObjectKey" = 'legacy/' || id, "gcsGeneration" = '0', tags = ARRAY[]::text[],
  category = CASE WHEN upper(field) = ANY(enum_range(NULL::"ResearchCategory")::text[])
    THEN upper(field)::"ResearchCategory" ELSE 'OTHER'::"ResearchCategory" END;
ALTER TABLE research_findings
  ALTER COLUMN "contentHash" DROP DEFAULT, ALTER COLUMN "embeddingHash" DROP DEFAULT,
  ALTER COLUMN "gcsGeneration" DROP DEFAULT, ALTER COLUMN "gcsObjectKey" DROP DEFAULT,
  ALTER COLUMN slug DROP DEFAULT, ALTER COLUMN statement DROP DEFAULT,
  ALTER COLUMN title DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;
UPDATE finding_relations SET id = 'c' || md5("fromId" || ':' || "toId"),
  "relationType" = CASE WHEN relation = 'requires' THEN 'REFINES'::"FindingRelationType" ELSE 'SUPPORTS'::"FindingRelationType" END;
ALTER TABLE finding_relations ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN "relationType" DROP DEFAULT, ADD CONSTRAINT finding_relations_pkey PRIMARY KEY (id);
-- CreateTable
CREATE TABLE "source_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "year" INTEGER,
    "venue" TEXT,
    "url" TEXT,
    "doi" TEXT,
    "rawTextKey" TEXT,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_chunks" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embeddingText" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_finding_relations" (
    "id" TEXT NOT NULL,
    "sourceFindingId" TEXT NOT NULL,
    "targetSlug" TEXT NOT NULL,
    "relationType" "FindingRelationType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_finding_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_report_citations" (
    "id" TEXT NOT NULL,
    "researchReportId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "decisionArea" "DecisionArea" NOT NULL,
    "rank" INTEGER NOT NULL,
    "rrfScore" DOUBLE PRECISION NOT NULL,
    "rerankScore" DOUBLE PRECISION,
    "viaRelation" BOOLEAN NOT NULL DEFAULT false,
    "reasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_report_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_ingestion_logs" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "generation" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" "IngestionOutcome" NOT NULL,
    "findingId" TEXT,
    "chunkCount" INTEGER,
    "errors" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corpus_ingestion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_documents_url_key" ON "source_documents"("url");

-- CreateIndex
CREATE UNIQUE INDEX "source_documents_doi_key" ON "source_documents"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "finding_chunks_findingId_chunkIndex_key" ON "finding_chunks"("findingId", "chunkIndex");

-- CreateIndex
CREATE INDEX "pending_finding_relations_targetSlug_idx" ON "pending_finding_relations"("targetSlug");

-- CreateIndex
CREATE UNIQUE INDEX "pending_finding_relations_sourceFindingId_targetSlug_relati_key" ON "pending_finding_relations"("sourceFindingId", "targetSlug", "relationType");

-- CreateIndex
CREATE INDEX "research_report_citations_findingId_idx" ON "research_report_citations"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "research_report_citations_researchReportId_findingId_decisi_key" ON "research_report_citations"("researchReportId", "findingId", "decisionArea");

-- CreateIndex
CREATE INDEX "corpus_ingestion_logs_objectKey_idx" ON "corpus_ingestion_logs"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "research_findings_slug_key" ON "research_findings"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "research_findings_gcsObjectKey_key" ON "research_findings"("gcsObjectKey");

-- CreateIndex
CREATE INDEX "research_findings_status_idx" ON "research_findings"("status");

-- CreateIndex
CREATE INDEX "research_findings_category_idx" ON "research_findings"("category");

-- CreateIndex
CREATE INDEX "finding_relations_toId_idx" ON "finding_relations"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "finding_relations_fromId_toId_relationType_key" ON "finding_relations"("fromId", "toId", "relationType");

-- AddForeignKey
ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_relations" ADD CONSTRAINT "finding_relations_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "research_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_relations" ADD CONSTRAINT "finding_relations_toId_fkey" FOREIGN KEY ("toId") REFERENCES "research_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_chunks" ADD CONSTRAINT "finding_chunks_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "research_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report_citations" ADD CONSTRAINT "research_report_citations_researchReportId_fkey" FOREIGN KEY ("researchReportId") REFERENCES "research_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report_citations" ADD CONSTRAINT "research_report_citations_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "research_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION research_findings_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.statement, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."appliesWhen", '')), 'C');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER research_findings_search_vector_trg
BEFORE INSERT OR UPDATE OF title, tags, statement, "appliesWhen" ON research_findings
FOR EACH ROW EXECUTE FUNCTION research_findings_search_vector_update();
UPDATE research_findings SET title = title;
CREATE INDEX research_findings_search_vector_idx ON research_findings USING gin ("searchVector");
CREATE INDEX finding_chunks_embedding_hnsw_idx ON finding_chunks USING hnsw (embedding vector_cosine_ops);

-- Copy valid Phase 1 citation-cache entries; leave older free-form cache entries intact.
INSERT INTO research_report_citations
  (id, "researchReportId", "findingId", "decisionArea", rank, "rrfScore", "rerankScore", "viaRelation", reasoning)
SELECT 'c' || md5(r.id || ':' || (c->>'findingId') || ':' || (c->>'decisionArea')),
  r.id, f.id, (c->>'decisionArea')::"DecisionArea", (c->>'rank')::integer,
  (c->>'rrfScore')::double precision, (c->>'rerankScore')::double precision,
  coalesce((c->>'viaRelation')::boolean, false), c->>'reasoning'
FROM research_reports r
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.citations) = 'array' THEN r.citations ELSE '[]'::jsonb END) c
JOIN research_findings f ON f.id = c->>'findingId'
WHERE c->>'decisionArea' = ANY(enum_range(NULL::"DecisionArea")::text[])
  AND c->>'rank' ~ '^[0-9]+$' AND c->>'rrfScore' ~ '^[0-9]+([.][0-9]+)?$'
  AND (c->>'rerankScore' IS NULL OR c->>'rerankScore' ~ '^[0-9]+([.][0-9]+)?$')
  AND (c->>'viaRelation' IS NULL OR c->>'viaRelation' IN ('true', 'false'))
  AND c->>'reasoning' IS NOT NULL
ON CONFLICT ("researchReportId", "findingId", "decisionArea") DO NOTHING;
UPDATE research_findings f SET "reuseCount" = (SELECT count(DISTINCT "researchReportId") FROM research_report_citations c WHERE c."findingId" = f.id);
COMMIT;