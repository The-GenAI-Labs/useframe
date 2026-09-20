-- CreateEnum
CREATE TYPE "ScoreStatus" AS ENUM ('PENDING', 'SCANNING', 'ANALYZING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "score_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "ScoreStatus" NOT NULL DEFAULT 'PENDING',
    "screenshotBase64" TEXT,
    "report" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "score_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "score_results_status_idx" ON "score_results"("status");

-- CreateIndex
CREATE INDEX "score_results_userId_idx" ON "score_results"("userId");

-- AddForeignKey
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
