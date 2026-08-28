ALTER TABLE "media_entries" ADD COLUMN "priority_index" integer;--> statement-breakpoint
CREATE INDEX "media_entries_user_priority_idx" ON "media_entries" USING btree ("user_id","priority_index");