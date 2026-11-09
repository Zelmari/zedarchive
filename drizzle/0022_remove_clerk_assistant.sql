ALTER TABLE "assistant_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_proposals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_usage" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "assistant_events" CASCADE;--> statement-breakpoint
DROP TABLE "assistant_proposals" CASCADE;--> statement-breakpoint
DROP TABLE "assistant_usage" CASCADE;--> statement-breakpoint
ALTER TABLE "media_entries" DROP CONSTRAINT "media_entries_secondary_unit_kind_check";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "secondary_unit_kind";