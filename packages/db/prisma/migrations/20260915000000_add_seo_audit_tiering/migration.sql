-- CreateEnum
CREATE TYPE "SeoAuditTier" AS ENUM ('free', 'paid');

-- AlterTable
ALTER TABLE "seo_audit_results" ADD COLUMN     "auditJson" JSONB,
ADD COLUMN     "computedScore" INTEGER,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "llmSummary" JSONB,
ADD COLUMN     "tier" "SeoAuditTier" NOT NULL DEFAULT 'free';

-- CreateIndex
CREATE INDEX "seo_audit_results_domain_tier_idx" ON "seo_audit_results"("domain", "tier");
