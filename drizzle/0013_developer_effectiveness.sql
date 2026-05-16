CREATE TYPE "public"."ai_insight_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_insight_scope" AS ENUM('user', 'team', 'company');--> statement-breakpoint
CREATE TABLE "ai_insight_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"summary_text" text,
	"panels_json" jsonb,
	"provenance_json" jsonb,
	"time_range_label" varchar(160),
	"grounding_hash" varchar(128),
	"confidence_note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insight_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scope_type" "ai_insight_scope" NOT NULL,
	"subject_user_id" uuid,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"model" varchar(80),
	"prompt_version" varchar(40),
	"status" "ai_insight_run_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursor_team_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"cursor_team_id" varchar(160),
	"last_sync_started_at" timestamp with time zone,
	"last_sync_success_at" timestamp with time zone,
	"last_sync_error" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cursor_team_connections_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "cursor_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"usage_date" timestamp NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"accepted_completions" integer DEFAULT 0 NOT NULL,
	"ai_lines_added" integer DEFAULT 0 NOT NULL,
	"ai_lines_deleted" integer DEFAULT 0 NOT NULL,
	"manual_lines_added" integer DEFAULT 0 NOT NULL,
	"manual_lines_deleted" integer DEFAULT 0 NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"model_usage_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ingestion_source" varchar(20) DEFAULT 'api' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursor_user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"cursor_external_user_id" varchar(160) NOT NULL,
	"user_id" uuid,
	"source_email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_effectiveness_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_type" "integration_provider" NOT NULL,
	"external_workspace_id" varchar(120) NOT NULL,
	"metric_date" timestamp NOT NULL,
	"delivery_effectiveness_score" numeric(5, 2),
	"ai_adoption_score" numeric(5, 2),
	"effectiveness_band" varchar(40),
	"component_scores_json" jsonb,
	"weight_profile_id" uuid,
	"ingestion_batch_id" uuid,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_effectiveness_sprint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_type" "integration_provider" NOT NULL,
	"external_workspace_id" varchar(120) NOT NULL,
	"external_sprint_id" varchar(120) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"delivery_effectiveness_score" numeric(5, 2),
	"ai_adoption_score" numeric(5, 2),
	"effectiveness_band" varchar(40),
	"component_scores_json" jsonb,
	"weight_profile_id" uuid,
	"ingestion_batch_id" uuid,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_type" "integration_provider" NOT NULL,
	"external_workspace_id" varchar(120) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"weight_profile_id" uuid,
	"delivery_effectiveness_score" numeric(5, 2) NOT NULL,
	"ai_adoption_score" numeric(5, 2) NOT NULL,
	"effectiveness_band" varchar(40) NOT NULL,
	"component_scores_json" jsonb NOT NULL,
	"ingestion_batch_id" uuid NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_weight_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" varchar(120) DEFAULT 'Default' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"weights_json" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_delivery_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_type" "integration_provider" NOT NULL,
	"external_workspace_id" varchar(120) NOT NULL,
	"assignee_user_id" uuid NOT NULL,
	"metric_date" timestamp NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"tasks_reopened" integer DEFAULT 0 NOT NULL,
	"story_points_completed" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tasks_active_end_of_day" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_delivery_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_type" "integration_provider" NOT NULL,
	"external_workspace_id" varchar(120) NOT NULL,
	"external_task_id" varchar(120) NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"task_status" varchar(100),
	"completed_at" timestamp with time zone,
	"assignee_user_id" uuid,
	"story_points" numeric(10, 2),
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_delivery_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"metric_date" timestamp NOT NULL,
	"logged_dev_minutes" integer DEFAULT 0 NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"approved_entry_count" integer DEFAULT 0 NOT NULL,
	"break_minutes_estimate" integer DEFAULT 0 NOT NULL,
	"timesheet_submitted_for_week" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reporting_job_role" varchar(120);--> statement-breakpoint
ALTER TABLE "ai_insight_outputs" ADD CONSTRAINT "ai_insight_outputs_run_id_ai_insight_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_insight_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insight_outputs" ADD CONSTRAINT "ai_insight_outputs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insight_runs" ADD CONSTRAINT "ai_insight_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insight_runs" ADD CONSTRAINT "ai_insight_runs_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insight_runs" ADD CONSTRAINT "ai_insight_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursor_team_connections" ADD CONSTRAINT "cursor_team_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursor_team_connections" ADD CONSTRAINT "cursor_team_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursor_usage_daily" ADD CONSTRAINT "cursor_usage_daily_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursor_usage_daily" ADD CONSTRAINT "cursor_usage_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursor_user_identities" ADD CONSTRAINT "cursor_user_identities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursor_user_identities" ADD CONSTRAINT "cursor_user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_effectiveness_daily" ADD CONSTRAINT "developer_effectiveness_daily_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_effectiveness_daily" ADD CONSTRAINT "developer_effectiveness_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_effectiveness_daily" ADD CONSTRAINT "developer_effectiveness_daily_weight_profile_id_score_weight_profiles_id_fk" FOREIGN KEY ("weight_profile_id") REFERENCES "public"."score_weight_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_effectiveness_sprint" ADD CONSTRAINT "developer_effectiveness_sprint_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_effectiveness_sprint" ADD CONSTRAINT "developer_effectiveness_sprint_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_effectiveness_sprint" ADD CONSTRAINT "developer_effectiveness_sprint_weight_profile_id_score_weight_profiles_id_fk" FOREIGN KEY ("weight_profile_id") REFERENCES "public"."score_weight_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_scores" ADD CONSTRAINT "developer_scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_scores" ADD CONSTRAINT "developer_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_scores" ADD CONSTRAINT "developer_scores_weight_profile_id_score_weight_profiles_id_fk" FOREIGN KEY ("weight_profile_id") REFERENCES "public"."score_weight_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_weight_profiles" ADD CONSTRAINT "score_weight_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_delivery_metrics_daily" ADD CONSTRAINT "task_delivery_metrics_daily_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_delivery_metrics_daily" ADD CONSTRAINT "task_delivery_metrics_daily_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_delivery_snapshots" ADD CONSTRAINT "task_delivery_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_delivery_snapshots" ADD CONSTRAINT "task_delivery_snapshots_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_delivery_metrics_daily" ADD CONSTRAINT "timesheet_delivery_metrics_daily_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_delivery_metrics_daily" ADD CONSTRAINT "timesheet_delivery_metrics_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_insight_outputs_run_idx" ON "ai_insight_outputs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_insight_runs_company_created_idx" ON "ai_insight_runs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "cursor_team_connections_company_idx" ON "cursor_team_connections" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cursor_usage_daily_company_user_date_source_unique" ON "cursor_usage_daily" USING btree ("company_id","user_id","usage_date","ingestion_source");--> statement-breakpoint
CREATE INDEX "cursor_usage_daily_company_date_idx" ON "cursor_usage_daily" USING btree ("company_id","usage_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cursor_user_identities_company_cursor_unique" ON "cursor_user_identities" USING btree ("company_id","cursor_external_user_id");--> statement-breakpoint
CREATE INDEX "cursor_user_identities_company_user_idx" ON "cursor_user_identities" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_effectiveness_daily_unique_grain" ON "developer_effectiveness_daily" USING btree ("company_id","user_id","integration_type","external_workspace_id","metric_date");--> statement-breakpoint
CREATE INDEX "developer_effectiveness_daily_company_date_idx" ON "developer_effectiveness_daily" USING btree ("company_id","integration_type","metric_date");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_effectiveness_sprint_unique_grain" ON "developer_effectiveness_sprint" USING btree ("company_id","user_id","integration_type","external_workspace_id","external_sprint_id");--> statement-breakpoint
CREATE INDEX "developer_scores_company_user_period_idx" ON "developer_scores" USING btree ("company_id","user_id","period_end");--> statement-breakpoint
CREATE INDEX "score_weight_profiles_company_default_idx" ON "score_weight_profiles" USING btree ("company_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "task_delivery_metrics_daily_unique_grain" ON "task_delivery_metrics_daily" USING btree ("company_id","integration_type","external_workspace_id","assignee_user_id","metric_date");--> statement-breakpoint
CREATE INDEX "task_delivery_metrics_daily_company_date_idx" ON "task_delivery_metrics_daily" USING btree ("company_id","integration_type","metric_date");--> statement-breakpoint
CREATE UNIQUE INDEX "task_delivery_snapshots_company_integration_task_day_unique" ON "task_delivery_snapshots" USING btree ("company_id","integration_type","external_workspace_id","external_task_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "task_delivery_snapshots_company_day_idx" ON "task_delivery_snapshots" USING btree ("company_id","integration_type","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_delivery_metrics_daily_unique_grain" ON "timesheet_delivery_metrics_daily" USING btree ("company_id","user_id","metric_date");--> statement-breakpoint
CREATE INDEX "timesheet_delivery_metrics_daily_company_date_idx" ON "timesheet_delivery_metrics_daily" USING btree ("company_id","metric_date");--> statement-breakpoint
INSERT INTO "score_weight_profiles" ("id", "company_id", "name", "is_default", "weights_json", "schema_version")
SELECT gen_random_uuid(), NULL, 'Global default', true, '{"taskCompletionRate":0.25,"storyPointCompletion":0.15,"estimateAccuracy":0.15,"aiAdoptionConsistency":0.1,"acceptedAiCompletions":0.1,"reopenedTaskReduction":0.1,"timesheetConsistency":0.1,"aiAssistedCodeContribution":0.05}'::jsonb, 1
WHERE NOT EXISTS (SELECT 1 FROM "score_weight_profiles" WHERE "company_id" IS NULL AND "is_default" = true);