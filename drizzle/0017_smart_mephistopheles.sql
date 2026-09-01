CREATE INDEX "api_cache_expires_at_idx" ON "external_api_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "stack_items_stack_id_idx" ON "stack_items" USING btree ("stack_id");--> statement-breakpoint
CREATE INDEX "stack_items_media_id_idx" ON "stack_items" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stack_items_stack_media_unique" ON "stack_items" USING btree ("stack_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "friendships_pair_unique" ON "friendships" (LEAST("sender_id", "receiver_id"), GREATEST("sender_id", "receiver_id"));