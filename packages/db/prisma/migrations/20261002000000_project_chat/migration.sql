CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "ChatTopic" AS ENUM ('COLOR', 'TYPOGRAPHY', 'LAYOUT', 'CONVERSION', 'TRUST_SOCIAL_PROOF', 'ACCESSIBILITY', 'MOTION', 'COPY_TONE', 'IMAGERY', 'SEO', 'PROJECT_OVERVIEW', 'COMPETITOR', 'OFF_TOPIC');
CREATE TABLE "project_chat_messages" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "role" "ChatMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "topic" "ChatTopic",
  "citedFindingIds" JSONB,
  "jevConfidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_chat_messages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "project_chat_messages_projectId_createdAt_idx" ON "project_chat_messages"("projectId", "createdAt");
