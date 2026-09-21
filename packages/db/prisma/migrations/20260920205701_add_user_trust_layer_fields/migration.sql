-- Auth trust layer: attribution capture + versioned ToS consent.
-- All columns are nullable additive columns — no backfill required.
ALTER TABLE "users" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "users" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "users" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "users" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "users" ADD COLUMN "acceptedTermsAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "acceptedTermsVersion" TEXT;
