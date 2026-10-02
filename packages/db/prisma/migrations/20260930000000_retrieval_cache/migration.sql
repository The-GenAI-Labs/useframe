BEGIN;
CREATE TABLE "corpus_version" (
  "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY CHECK (id = 1),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);
INSERT INTO "corpus_version" (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;
CREATE TABLE "retrieval_cache_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "decisionArea" "DecisionArea" NOT NULL,
  "niche" "NicheCategory" NOT NULL,
  "hydePassage" TEXT NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "findings" JSONB NOT NULL,
  "corpusVersion" INTEGER NOT NULL,
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHitAt" TIMESTAMP(3)
);
CREATE INDEX retrieval_cache_metadata_idx ON retrieval_cache_entries ("decisionArea", niche, "corpusVersion", "embeddingModel", fingerprint);
CREATE INDEX retrieval_cache_embedding_hnsw_idx ON retrieval_cache_entries USING hnsw (embedding vector_cosine_ops);
CREATE TABLE jev_decision_logs (
  id TEXT PRIMARY KEY, feature TEXT NOT NULL, mode TEXT NOT NULL, "policyKey" TEXT NOT NULL,
  accepted BOOLEAN NOT NULL, agreement BOOLEAN, confidence DOUBLE PRECISION, "durationMs" INTEGER NOT NULL,
  input JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "jev_decision_logs_feature_policyKey_mode_createdAt_idx" ON jev_decision_logs (feature, "policyKey", mode, "createdAt");
COMMIT;