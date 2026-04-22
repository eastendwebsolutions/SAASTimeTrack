CREATE TYPE "public"."pp_session_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pp_writeback_mode" AS ENUM('immediate', 'on_sprint_completion');--> statement-breakpoint
CREATE TYPE "public"."pp_restart_scope" AS ENUM('full', 'stories');--> statement-breakpoint
CREATE TYPE "public"."pp_participant_role" AS ENUM('facilitator', 'participant');--> statement-breakpoint
CREATE TYPE "public"."pp_story_status" AS ENUM('pending', 'voting', 'revealed', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."pp_round_state" AS ENUM('open', 'revealed', 'closed');--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "asana_sprint_field_gid" varchar(100);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "asana_sprint_field_name" varchar(255);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "asana_story_points_field_gid" varchar(100);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "asana_story_points_field_name" varchar(255);--> statement-breakpoint
CREATE TABLE "pp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "pp_session_status" DEFAULT 'draft' NOT NULL,
	"asana_workspace_id" varchar(100),
	"asana_project_id" varchar(100),
	"sprint_field_gid" varchar(100) NOT NULL,
	"sprint_field_name" varchar(255) NOT NULL,
	"selected_sprint_value_gid" varchar(100) NOT NULL,
	"selected_sprint_value_name" varchar(255) NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"writeback_mode" "pp_writeback_mode" DEFAULT 'immediate' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pp_session_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"parent_version_number" integer,
	"created_by_user_id" uuid NOT NULL,
	"restart_reason" text,
	"restart_scope" "pp_restart_scope",
	"is_active_version" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pp_session_participants" (
	"session_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "pp_participant_role" DEFAULT 'participant' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pp_session_participants_session_id_version_id_user_id_pk" PRIMARY KEY("session_id","version_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pp_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"asana_task_gid" varchar(100) NOT NULL,
	"asana_parent_task_gid" varchar(100),
	"name" varchar(255) NOT NULL,
	"is_subtask" boolean DEFAULT false NOT NULL,
	"ordering" integer DEFAULT 0 NOT NULL,
	"status" "pp_story_status" DEFAULT 'pending' NOT NULL,
	"final_estimate" integer,
	"finalized_at" timestamp with time zone,
	"finalized_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pp_vote_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"state" "pp_round_state" DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revealed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"revote_of_round_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pp_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vote_value" varchar(20) NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pp_history_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action_type" varchar(80) NOT NULL,
	"target_type" varchar(80),
	"target_id" uuid,
	"payload_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pp_sessions" ADD CONSTRAINT "pp_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_sessions" ADD CONSTRAINT "pp_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_session_versions" ADD CONSTRAINT "pp_session_versions_session_id_pp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_session_versions" ADD CONSTRAINT "pp_session_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_session_participants" ADD CONSTRAINT "pp_session_participants_session_id_pp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_session_participants" ADD CONSTRAINT "pp_session_participants_version_id_pp_session_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pp_session_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_session_participants" ADD CONSTRAINT "pp_session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_stories" ADD CONSTRAINT "pp_stories_session_id_pp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_stories" ADD CONSTRAINT "pp_stories_version_id_pp_session_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pp_session_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_stories" ADD CONSTRAINT "pp_stories_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_vote_rounds" ADD CONSTRAINT "pp_vote_rounds_session_id_pp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_vote_rounds" ADD CONSTRAINT "pp_vote_rounds_version_id_pp_session_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pp_session_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_vote_rounds" ADD CONSTRAINT "pp_vote_rounds_story_id_pp_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."pp_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_votes" ADD CONSTRAINT "pp_votes_session_id_pp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_votes" ADD CONSTRAINT "pp_votes_version_id_pp_session_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pp_session_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_votes" ADD CONSTRAINT "pp_votes_story_id_pp_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."pp_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_votes" ADD CONSTRAINT "pp_votes_round_id_pp_vote_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."pp_vote_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_votes" ADD CONSTRAINT "pp_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_history_log" ADD CONSTRAINT "pp_history_log_session_id_pp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_history_log" ADD CONSTRAINT "pp_history_log_version_id_pp_session_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pp_session_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_history_log" ADD CONSTRAINT "pp_history_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pp_sessions_company_status_idx" ON "pp_sessions" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pp_session_versions_session_version_unique" ON "pp_session_versions" USING btree ("session_id","version_number");--> statement-breakpoint
CREATE INDEX "pp_session_versions_active_idx" ON "pp_session_versions" USING btree ("session_id","is_active_version");--> statement-breakpoint
CREATE INDEX "pp_session_participants_version_idx" ON "pp_session_participants" USING btree ("version_id","user_id");--> statement-breakpoint
CREATE INDEX "pp_stories_version_order_idx" ON "pp_stories" USING btree ("version_id","ordering");--> statement-breakpoint
CREATE UNIQUE INDEX "pp_stories_version_task_unique" ON "pp_stories" USING btree ("version_id","asana_task_gid");--> statement-breakpoint
CREATE UNIQUE INDEX "pp_vote_rounds_story_round_unique" ON "pp_vote_rounds" USING btree ("story_id","round_number");--> statement-breakpoint
CREATE INDEX "pp_vote_rounds_story_state_idx" ON "pp_vote_rounds" USING btree ("story_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "pp_votes_round_user_unique" ON "pp_votes" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE INDEX "pp_votes_story_round_idx" ON "pp_votes" USING btree ("story_id","round_id");--> statement-breakpoint
CREATE INDEX "pp_history_log_session_created_idx" ON "pp_history_log" USING btree ("session_id","created_at");
