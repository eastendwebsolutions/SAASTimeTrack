DO $$ BEGIN
  CREATE TYPE "integration_provider" AS ENUM ('asana', 'jira', 'monday');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "active_integration_provider" "integration_provider" DEFAULT 'asana' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "provider" "integration_provider" DEFAULT 'asana' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monday_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE,
  "monday_user_id" varchar(120) NOT NULL,
  "monday_account_id" varchar(120),
  "monday_account_slug" varchar(255),
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text,
  "expires_at" timestamp with time zone,
  "scopes" text,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "monday_connections"
  ADD CONSTRAINT "monday_connections_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "projects" SET "provider" = 'asana' WHERE "provider" IS NULL;
--> statement-breakpoint
UPDATE "projects" SET "provider" = 'jira' WHERE "asana_project_id" LIKE 'jira:%';
--> statement-breakpoint
UPDATE "projects" SET "provider" = 'monday' WHERE "asana_project_id" LIKE 'monday:%';
