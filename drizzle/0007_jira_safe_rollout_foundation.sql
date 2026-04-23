CREATE TABLE IF NOT EXISTS "jira_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE,
  "jira_account_id" varchar(120) NOT NULL,
  "jira_cloud_id" varchar(120) NOT NULL,
  "jira_site_name" varchar(255),
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
  ALTER TABLE "jira_connections"
  ADD CONSTRAINT "jira_connections_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
