ALTER TABLE "anime_entries" ADD COLUMN "is_favourite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_entries" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "anime_entries" ADD COLUMN "finish_date" date;--> statement-breakpoint
ALTER TABLE "anime_entries" ADD CONSTRAINT "anime_entries_date_range_check" CHECK (("anime_entries"."start_date" is null or isfinite("anime_entries"."start_date")) and ("anime_entries"."finish_date" is null or isfinite("anime_entries"."finish_date")) and ("anime_entries"."start_date" is null or "anime_entries"."finish_date" is null or "anime_entries"."finish_date" >= "anime_entries"."start_date"));
