CREATE TABLE IF NOT EXISTS "user_billing_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"address_2" varchar(255),
	"city" varchar(120) NOT NULL,
	"state" varchar(120),
	"province" varchar(120),
	"zip" varchar(32) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"paypal_address" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_billing_profiles" ADD CONSTRAINT "user_billing_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD COLUMN IF NOT EXISTS "invoice_number" varchar(100);
--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD COLUMN IF NOT EXISTS "invoice_line_items_json" jsonb;
--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD COLUMN IF NOT EXISTS "user_billing_snapshot_json" jsonb;
