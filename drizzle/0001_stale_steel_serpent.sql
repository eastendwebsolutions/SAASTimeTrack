ALTER TABLE "sync_runs" ADD COLUMN "projects_synced" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "tasks_synced" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "subtasks_synced" integer DEFAULT 0 NOT NULL;