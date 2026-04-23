DO $$ BEGIN
 CREATE TYPE "public"."integration_provider" AS ENUM('asana', 'jira');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_integration_provider" "integration_provider" DEFAULT 'asana' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "provider" "integration_provider" DEFAULT 'asana' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_project_id" varchar(120);
--> statement-breakpoint
UPDATE "projects" SET "external_project_id" = "asana_project_id" WHERE "external_project_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "external_project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "provider" "integration_provider" DEFAULT 'asana' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_task_id" varchar(120);
--> statement-breakpoint
UPDATE "tasks" SET "external_task_id" = "asana_task_id" WHERE "external_task_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "external_task_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "provider" "integration_provider" DEFAULT 'asana' NOT NULL;
--> statement-breakpoint
CREATE TABLE "jira_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jira_account_id" varchar(120) NOT NULL,
	"jira_cloud_id" varchar(120) NOT NULL,
	"jira_site_name" varchar(255),
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"expires_at" timestamp with time zone,
	"scopes" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jira_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "jira_connections" ADD CONSTRAINT "jira_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_provider_external_unique" ON "projects" USING btree ("synced_by_user_id","provider","external_project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_project_provider_external_unique" ON "tasks" USING btree ("project_id","provider","external_task_id");
