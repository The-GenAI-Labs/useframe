-- Carry ToS consent + attribution with the magic-link token itself, so it
-- survives the link being opened in a different tab/device than the one
-- that requested it.
ALTER TABLE "magic_link_tokens" ADD COLUMN "acceptedTerms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "magic_link_tokens" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "magic_link_tokens" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "magic_link_tokens" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "magic_link_tokens" ADD COLUMN "utmCampaign" TEXT;
