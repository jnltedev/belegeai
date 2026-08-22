CREATE TABLE "push_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proxy_url" text NOT NULL,
	"instance_id" text NOT NULL,
	"instance_token_encrypted" text NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_error" text
);
