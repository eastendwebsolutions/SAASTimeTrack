ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "team_status_teams_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "team_status_teams_delivery_method" varchar(20) DEFAULT 'email' NOT NULL;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "team_status_teams_channel_label" varchar(255);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "team_status_teams_destination_encrypted" text;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "team_status_teams_last_tested_at" timestamp with time zone;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "team_status_teams_last_error" text;
