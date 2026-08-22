ALTER TABLE "documents" DROP CONSTRAINT "documents_uploaded_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_review" ALTER COLUMN "reviewed_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_review" DROP CONSTRAINT "extraction_review_reviewed_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "extraction_review" ADD CONSTRAINT "extraction_review_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
