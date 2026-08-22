ALTER TABLE "documents" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "source" SET DEFAULT 'manual'::text;--> statement-breakpoint
DROP TYPE "public"."document_source";--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('manual', 'imap', 'api');--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "source" SET DEFAULT 'manual'::"public"."document_source";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "source" SET DATA TYPE "public"."document_source" USING "source"::"public"."document_source";