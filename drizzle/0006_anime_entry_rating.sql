ALTER TABLE "anime_entries" ADD COLUMN "rating" numeric;--> statement-breakpoint
ALTER TABLE "anime_entries" ADD CONSTRAINT "anime_entries_rating_check" CHECK ("anime_entries"."rating" is null or ("anime_entries"."rating" between 1 and 10 and "anime_entries"."rating" * 10 = trunc("anime_entries"."rating" * 10)));
