DO $$ BEGIN
  CREATE TYPE "reporting_sprint_status" AS ENUM ('planned', 'active', 'completed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "integration_mapping_scope_type" AS ENUM ('company', 'workspace', 'project');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "time_entries"
ADD COLUMN IF NOT EXISTS "integration_type" "integration_provider" DEFAULT 'asana' NOT NULL;
--> statement-breakpoint
ALTER TABLE "time_entries"
ADD COLUMN IF NOT EXISTS "external_workspace_id" varchar(120);
--> statement-breakpoint
ALTER TABLE "time_entries"
ADD COLUMN IF NOT EXISTS "external_project_id" varchar(120);
--> statement-breakpoint
ALTER TABLE "time_entries"
ADD COLUMN IF NOT EXISTS "external_task_id" varchar(120);
--> statement-breakpoint
ALTER TABLE "time_entries"
ADD COLUMN IF NOT EXISTS "external_subtask_id" varchar(120);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_reporting_lookup_idx" ON "time_entries" USING btree (
  "company_id",
  "integration_type",
  "external_workspace_id",
  "entry_date",
  "user_id"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reporting_workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "integration_type" "integration_provider" NOT NULL,
  "external_workspace_id" varchar(120) NOT NULL,
  "workspace_name" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reporting_workspaces"
  ADD CONSTRAINT "reporting_workspaces_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reporting_workspaces_company_integration_external_unique"
ON "reporting_workspaces" USING btree ("company_id", "integration_type", "external_workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_workspaces_company_workspace_idx"
ON "reporting_workspaces" USING btree ("company_id", "integration_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reporting_sprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "integration_type" "integration_provider" NOT NULL,
  "external_workspace_id" varchar(120) NOT NULL,
  "external_sprint_id" varchar(120) NOT NULL,
  "sprint_name" varchar(255) NOT NULL,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "status" "reporting_sprint_status" DEFAULT 'planned' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reporting_sprints"
  ADD CONSTRAINT "reporting_sprints_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reporting_sprints_company_integration_external_unique"
ON "reporting_sprints" USING btree ("company_id", "integration_type", "external_workspace_id", "external_sprint_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_sprints_period_lookup_idx"
ON "reporting_sprints" USING btree ("company_id", "integration_type", "external_workspace_id", "start_date", "end_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reporting_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "integration_type" "integration_provider" NOT NULL,
  "external_workspace_id" varchar(120) NOT NULL,
  "external_project_id" varchar(120),
  "external_sprint_id" varchar(120),
  "external_task_id" varchar(120) NOT NULL,
  "external_parent_task_id" varchar(120),
  "task_name" varchar(255) NOT NULL,
  "project_name" varchar(255),
  "assignee_external_id" varchar(120),
  "assignee_user_id" uuid,
  "estimate_hours" numeric(10, 2),
  "story_points" numeric(10, 2),
  "actual_points" numeric(10, 2),
  "task_status" varchar(100),
  "completed_at" timestamp with time zone,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reporting_tasks"
  ADD CONSTRAINT "reporting_tasks_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reporting_tasks"
  ADD CONSTRAINT "reporting_tasks_assignee_user_id_users_id_fk"
  FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reporting_tasks_company_integration_external_unique"
ON "reporting_tasks" USING btree ("company_id", "integration_type", "external_workspace_id", "external_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_tasks_sprint_lookup_idx"
ON "reporting_tasks" USING btree ("company_id", "integration_type", "external_workspace_id", "external_sprint_id", "assignee_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_tasks_status_lookup_idx"
ON "reporting_tasks" USING btree ("company_id", "task_status", "completed_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_field_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "integration_type" "integration_provider" NOT NULL,
  "scope_type" "integration_mapping_scope_type" DEFAULT 'company' NOT NULL,
  "scope_external_id" varchar(120),
  "mapping_key" varchar(120) NOT NULL,
  "external_field_id" varchar(120),
  "external_field_name" varchar(255),
  "external_field_type" varchar(100),
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata_json" jsonb,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_field_mappings"
  ADD CONSTRAINT "integration_field_mappings_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_field_mappings"
  ADD CONSTRAINT "integration_field_mappings_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_field_mappings_company_provider_key_active_idx"
ON "integration_field_mappings" USING btree ("company_id", "integration_type", "mapping_key", "is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_field_mappings_scope_lookup_idx"
ON "integration_field_mappings" USING btree ("company_id", "integration_type", "scope_type", "scope_external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_field_mappings_active_scope_unique"
ON "integration_field_mappings" USING btree ("company_id", "integration_type", "scope_type", "scope_external_id", "mapping_key", "is_active");
--> statement-breakpoint
INSERT INTO "integration_field_mappings" (
  "company_id",
  "integration_type",
  "scope_type",
  "mapping_key",
  "external_field_id",
  "external_field_name",
  "is_active"
)
SELECT "company_id", 'asana', 'company', 'sprint', "asana_sprint_field_gid", "asana_sprint_field_name", true
FROM "company_settings"
WHERE "asana_sprint_field_gid" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "integration_field_mappings" (
  "company_id",
  "integration_type",
  "scope_type",
  "mapping_key",
  "external_field_id",
  "external_field_name",
  "is_active"
)
SELECT "company_id", 'asana', 'company', 'story_points', "asana_story_points_field_gid", "asana_story_points_field_name", true
FROM "company_settings"
WHERE "asana_story_points_field_gid" IS NOT NULL
ON CONFLICT DO NOTHING;
