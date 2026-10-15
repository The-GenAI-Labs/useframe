-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'FLAGGED';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "highlighted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "creditsGranted" INTEGER,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "planName" TEXT,
ADD COLUMN     "planSlug" TEXT;

-- CreateIndex
CREATE INDEX "plans_isActive_rank_idx" ON "plans"("isActive", "rank");

-- CreateIndex
CREATE INDEX "payments_planId_idx" ON "payments"("planId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Prices and credit grants are never negative.
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_credits_nonnegative" CHECK ("priceMinor" >= 0 AND "credits" >= 0);
