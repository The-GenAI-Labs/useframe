-- Carry signup risk inputs (IP + device fingerprint) with the magic-link
-- token itself, captured at request time — the IP/device that matters for
-- risk scoring is the one that asked for the link, not whichever browser
-- later clicks it.
ALTER TABLE "magic_link_tokens" ADD COLUMN "requestIp" TEXT;
ALTER TABLE "magic_link_tokens" ADD COLUMN "deviceFingerprint" TEXT;
