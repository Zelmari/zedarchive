ALTER TABLE "discord_link_codes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discord_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_api_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "friendships" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_cycles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_entry_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_quotes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stack_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stacks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_goals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "discord_link_codes" CASCADE;--> statement-breakpoint
DROP TABLE "discord_links" CASCADE;--> statement-breakpoint
DROP TABLE "external_api_cache" CASCADE;--> statement-breakpoint
DROP TABLE "friendships" CASCADE;--> statement-breakpoint
DROP TABLE "group_members" CASCADE;--> statement-breakpoint
DROP TABLE "group_messages" CASCADE;--> statement-breakpoint
DROP TABLE "groups" CASCADE;--> statement-breakpoint
DROP TABLE "media_cycles" CASCADE;--> statement-breakpoint
DROP TABLE "media_entry_tags" CASCADE;--> statement-breakpoint
DROP TABLE "media_quotes" CASCADE;--> statement-breakpoint
DROP TABLE "media_tags" CASCADE;--> statement-breakpoint
DROP TABLE "stack_items" CASCADE;--> statement-breakpoint
DROP TABLE "stacks" CASCADE;--> statement-breakpoint
DROP TABLE "user_goals" CASCADE;--> statement-breakpoint
DROP INDEX "media_entries_group_id_idx";--> statement-breakpoint
DROP INDEX "media_entries_group_updated_idx";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "group_id";--> statement-breakpoint
DROP TYPE "public"."friendship_status";--> statement-breakpoint
DROP TYPE "public"."group_role";