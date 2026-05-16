ALTER TABLE "user_billing_profiles" ADD COLUMN IF NOT EXISTS "first_name" varchar(120) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" ADD COLUMN IF NOT EXISTS "last_name" varchar(120) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" ADD COLUMN IF NOT EXISTS "country" varchar(120) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" ALTER COLUMN "first_name" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" ALTER COLUMN "last_name" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" ALTER COLUMN "country" DROP DEFAULT;
--> statement-breakpoint
UPDATE "user_billing_profiles" SET "state" = '' WHERE "state" IS NULL;
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" ALTER COLUMN "state" SET NOT NULL;
