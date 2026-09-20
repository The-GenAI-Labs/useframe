-- CreateEnum
CREATE TYPE "SeoAuditStatus" AS ENUM ('PENDING', 'CRAWLING', 'AUDITING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "seo_audit_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "SeoAuditStatus" NOT NULL DEFAULT 'PENDING',
    "performanceScore" INTEGER,
    "accessibilityScore" INTEGER,
    "seoScore" INTEGER,
    "bestPracticesScore" INTEGER,
    "pagesCrawled" INTEGER,
    "crawlResults" JSONB,
    "keywords" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_audit_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seo_audit_results_status_idx" ON "seo_audit_results"("status");

-- CreateIndex
CREATE INDEX "seo_audit_results_userId_idx" ON "seo_audit_results"("userId");

-- AddForeignKey
ALTER TABLE "seo_audit_results" ADD CONSTRAINT "seo_audit_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
