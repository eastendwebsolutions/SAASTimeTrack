-- Per-user Asana cache: run if upgrading an existing DB (or use `npm run db:push` from current Drizzle schema).
-- 1) Add synced_by_user_id to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "synced_by_user_id" uuid;

UPDATE "projects" p
SET "synced_by_user_id" = (
  SELECT u.id FROM "users" u
  WHERE u.company_id = p.company_id
  ORDER BY u.created_at ASC
  LIMIT 1
)
WHERE p.synced_by_user_id IS NULL;

ALTER TABLE "projects" ALTER COLUMN "synced_by_user_id" SET NOT NULL;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_synced_by_user_id_users_id_fk";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_synced_by_user_id_users_id_fk"
  FOREIGN KEY ("synced_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "projects_company_asana_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "projects_user_asana_unique"
  ON "projects" ("synced_by_user_id", "asana_project_id");

CREATE INDEX IF NOT EXISTS "projects_user_active_idx"
  ON "projects" ("synced_by_user_id", "is_active");

-- 2) Tasks: unique per (project_id, asana_task_id) instead of global asana_task_id
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_asana_task_id_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_project_asana_unique"
  ON "tasks" ("project_id", "asana_task_id");
