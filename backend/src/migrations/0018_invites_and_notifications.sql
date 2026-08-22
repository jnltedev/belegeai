CREATE TYPE "public"."reset_purpose" AS ENUM('invite', 'reset');--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "reset_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"smtp_enabled" boolean DEFAULT false NOT NULL,
	"smtp_host" text,
	"smtp_port" integer DEFAULT 587,
	"smtp_secure" boolean DEFAULT false NOT NULL,
	"smtp_username" text,
	"smtp_password_encrypted" text,
	"smtp_from_address" text,
	"smtp_from_name" text,
	"smtp_notify_recipient" text,
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"telegram_bot_token_encrypted" text,
	"telegram_chat_id" text,
	"discord_enabled" boolean DEFAULT false NOT NULL,
	"discord_webhook_url_encrypted" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
