CREATE TYPE "public"."billing_email_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."billing_submission_status" AS ENUM('submitted', 'accepted', 'needs_resubmission', 'failed');--> statement-breakpoint
CREATE TABLE "billing_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_start_date" timestamp NOT NULL,
	"period_end_date" timestamp NOT NULL,
	"timezone" varchar(100) DEFAULT 'America/New_York' NOT NULL,
	"label" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"to_recipients_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_recipients_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_body_footer" text,
	"submission_instructions" text,
	"overdue_banner_enabled" boolean DEFAULT true NOT NULL,
	"expected_submission_cutoff_time" varchar(20),
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_settings_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "billing_submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_submission_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"stored_file_name" varchar(255) NOT NULL,
	"file_mime_type" varchar(120) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_at_utc" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"billing_period_id" uuid NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body_content" text,
	"status" "billing_submission_status" DEFAULT 'submitted' NOT NULL,
	"submission_attempt_number" integer DEFAULT 1 NOT NULL,
	"submitted_at_utc" timestamp with time zone NOT NULL,
	"submitted_at_local_label" varchar(120),
	"email_to_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_cc_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_status" "billing_email_status" DEFAULT 'pending' NOT NULL,
	"email_error_message" text,
	"admin_note" text,
	"resubmission_requested_by_user_id" uuid,
	"resubmission_requested_at_utc" timestamp with time zone,
	"resubmission_due_at_utc" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"accepted_at_utc" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submission_files" ADD CONSTRAINT "billing_submission_files_billing_submission_id_billing_submissions_id_fk" FOREIGN KEY ("billing_submission_id") REFERENCES "public"."billing_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submission_files" ADD CONSTRAINT "billing_submission_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submission_files" ADD CONSTRAINT "billing_submission_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD CONSTRAINT "billing_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD CONSTRAINT "billing_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD CONSTRAINT "billing_submissions_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD CONSTRAINT "billing_submissions_resubmission_requested_by_user_id_users_id_fk" FOREIGN KEY ("resubmission_requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_submissions" ADD CONSTRAINT "billing_submissions_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_periods_company_start_end_unique" ON "billing_periods" USING btree ("company_id","period_start_date","period_end_date");--> statement-breakpoint
CREATE INDEX "billing_periods_company_period_lookup_idx" ON "billing_periods" USING btree ("company_id","period_start_date","period_end_date");--> statement-breakpoint
CREATE INDEX "billing_submission_files_submission_idx" ON "billing_submission_files" USING btree ("billing_submission_id");--> statement-breakpoint
CREATE INDEX "billing_submissions_company_user_period_created_idx" ON "billing_submissions" USING btree ("company_id","user_id","billing_period_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_submissions_period_status_idx" ON "billing_submissions" USING btree ("billing_period_id","status","created_at");