-- Free-tier abuse prevention: signup risk scoring + durable project tier.

-- Signup risk decision/score on User (latest assessment only)
ALTER TABLE "users" ADD COLUMN "signupRiskDecision" TEXT;
ALTER TABLE "users" ADD COLUMN "signupRiskScore" INTEGER;

-- Append-only signup risk event log
CREATE TABLE "signup_risk_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "riskScore" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_risk_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "signup_risk_events_ipAddress_createdAt_idx" ON "signup_risk_events"("ipAddress", "createdAt");
CREATE INDEX "signup_risk_events_deviceFingerprint_createdAt_idx" ON "signup_risk_events"("deviceFingerprint", "createdAt");

ALTER TABLE "signup_risk_events" ADD CONSTRAINT "signup_risk_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Durable per-project generation tier, so the workspace UI (model-tier
-- banner) can read it back reliably after a reload, not just the one-shot
-- create response.
CREATE TYPE "GenerationTier" AS ENUM ('FREE', 'PAID');

ALTER TABLE "projects" ADD COLUMN "generationTier" "GenerationTier" NOT NULL DEFAULT 'PAID';
