CREATE TYPE "public"."media_category" AS ENUM('show', 'book', 'anime', 'manga');--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "category" "media_category" DEFAULT 'show' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "primary_unit_current" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "primary_unit_total" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "secondary_unit_current" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "secondary_unit_total" integer;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "structure" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "current_season";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "total_seasons";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "current_progress";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "total_units";--> statement-breakpoint
ALTER TABLE "media_entries" DROP COLUMN "rating";--> statement-breakpoint
DROP TYPE "public"."media_type";--> statement-breakpoint
DROP TYPE "public"."media_status";