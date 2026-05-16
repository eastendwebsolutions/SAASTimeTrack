ALTER TABLE "billing_settings" ADD COLUMN IF NOT EXISTS "bcc_recipients_json" jsonb DEFAULT '[]'::jsonb NOT NULL;
