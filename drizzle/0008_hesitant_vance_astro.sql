ALTER TABLE "media_entries" ADD COLUMN "drop_reason" text;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "dropped_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "dropped_progress_primary" integer;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "dropped_progress_secondary" integer;--> statement-breakpoint
CREATE INDEX "media_entries_user_status_idx" ON "media_entries" USING btree ("user_id","status");