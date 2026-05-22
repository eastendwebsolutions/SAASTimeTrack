ALTER TABLE "user_billing_profiles" ADD COLUMN IF NOT EXISTS "payment_account_type" varchar(32) NOT NULL DEFAULT 'PayPal';
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" RENAME COLUMN "paypal_address" TO "payment_account_address";
