CREATE TABLE "pp_workspace_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"asana_workspace_id" varchar(100) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pp_workspace_admins" ADD CONSTRAINT "pp_workspace_admins_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_workspace_admins" ADD CONSTRAINT "pp_workspace_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pp_workspace_admins" ADD CONSTRAINT "pp_workspace_admins_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pp_workspace_admins_company_workspace_user_unique" ON "pp_workspace_admins" USING btree ("company_id","asana_workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "pp_workspace_admins_user_workspace_idx" ON "pp_workspace_admins" USING btree ("user_id","asana_workspace_id");
