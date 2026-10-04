CREATE TYPE "SiteFramework" AS ENUM ('NEXT_EXPORT', 'VITE_SPA');

ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'ACTIVATING';
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE "credit_transactions" ADD COLUMN IF NOT EXISTS "refType" TEXT;

-- One refund per deployment; Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "credit_transactions_deployment_refund_key"
  ON "credit_transactions"("refId")
  WHERE "type" = 'REFUND' AND "refType" = 'DEPLOYMENT';

ALTER TABLE "deployments"
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "framework" "SiteFramework",
  ADD COLUMN "storagePrefix" TEXT,
  ADD COLUMN "fileCount" INTEGER,
  ADD COLUMN "totalBytes" BIGINT,
  ADD COLUMN "rootHtmlSha256" TEXT,
  ADD COLUMN "siteUrl" TEXT,
  ADD COLUMN "triggeredBy" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "purgedAt" TIMESTAMP(3);

CREATE TABLE "project_sites" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "subdomainLabel" TEXT NOT NULL,
  "defaultHost" TEXT NOT NULL,
  "primaryHost" TEXT NOT NULL,
  "activeDeploymentId" TEXT,
  "suspendedAt" TIMESTAMP(3),
  "suspendedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_sites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_sites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "project_sites_projectId_key" ON "project_sites"("projectId");
CREATE UNIQUE INDEX "project_sites_subdomainLabel_key" ON "project_sites"("subdomainLabel");
CREATE UNIQUE INDEX "project_sites_defaultHost_key" ON "project_sites"("defaultHost");

CREATE INDEX "deployments_siteId_idx" ON "deployments"("siteId");
CREATE INDEX "deployments_projectId_status_idx" ON "deployments"("projectId", "status");
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "project_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
