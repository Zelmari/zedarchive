CREATE INDEX "activity_user_created_idx" ON "media_activity_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_entries_user_updated_idx" ON "media_entries" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_profile_expires_idx" ON "profile_comments" USING btree ("profile_user_id","expires_at");--> statement-breakpoint
CREATE INDEX "comments_author_created_idx" ON "profile_comments" USING btree ("author_user_id","created_at" DESC NULLS LAST);