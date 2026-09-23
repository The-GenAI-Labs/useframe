-- Stripe -> Razorpay migration.
-- Renamed rather than dropped/recreated so the unique index survives; values
-- are cleared because a Stripe customer id is meaningless to Razorpay.
ALTER TABLE "users" RENAME COLUMN "stripeCustomerId" TO "razorpayCustomerId";
UPDATE "users" SET "razorpayCustomerId" = NULL, "defaultPaymentMethodId" = NULL;

-- Existing rows keep their historical "stripe" value on purpose — they really
-- were Stripe payments, and rewriting them would falsify the record.
ALTER TABLE "payments" ALTER COLUMN "provider" SET DEFAULT 'razorpay';
-- currency default stays USD: the credit packs are dollar-priced.
ALTER TABLE "webhook_events" ALTER COLUMN "provider" SET DEFAULT 'razorpay';
ALTER TABLE "orders" ALTER COLUMN "provider" SET DEFAULT 'razorpay';
