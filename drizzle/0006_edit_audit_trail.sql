CREATE TABLE "audit_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"page_key" varchar(100) NOT NULL,
	"context_key" varchar(160),
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(100),
	"field_name" varchar(120) NOT NULL,
	"before_value" text,
	"after_value" text,
	"actor_user_id" uuid NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_change_log" ADD CONSTRAINT "audit_change_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_change_log" ADD CONSTRAINT "audit_change_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_change_log_company_page_created_idx" ON "audit_change_log" USING btree ("company_id","page_key","created_at");--> statement-breakpoint
CREATE INDEX "audit_change_log_company_page_context_created_idx" ON "audit_change_log" USING btree ("company_id","page_key","context_key","created_at");
