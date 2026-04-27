CREATE TYPE "public"."team_status_event_type" AS ENUM('DAY_IN', 'DAY_OUT', 'BREAK_IN', 'BREAK_OUT');--> statement-breakpoint
CREATE TABLE "team_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" "team_status_event_type" NOT NULL,
	"event_timestamp_utc" timestamp with time zone NOT NULL,
	"event_timezone" varchar(100) DEFAULT 'America/New_York' NOT NULL,
	"event_local_date" timestamp NOT NULL,
	"event_local_time_label" varchar(80),
	"source" varchar(50) DEFAULT 'web_dashboard' NOT NULL,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "team_status_events" ADD CONSTRAINT "team_status_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_status_events" ADD CONSTRAINT "team_status_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_status_events" ADD CONSTRAINT "team_status_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_status_events_company_idx" ON "team_status_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "team_status_events_user_idx" ON "team_status_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_status_events_local_date_idx" ON "team_status_events" USING btree ("event_local_date");--> statement-breakpoint
CREATE INDEX "team_status_events_event_type_idx" ON "team_status_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "team_status_events_event_timestamp_utc_idx" ON "team_status_events" USING btree ("event_timestamp_utc");--> statement-breakpoint
CREATE INDEX "team_status_events_company_local_date_idx" ON "team_status_events" USING btree ("company_id","event_local_date");--> statement-breakpoint
CREATE INDEX "team_status_events_user_local_date_idx" ON "team_status_events" USING btree ("user_id","event_local_date");
