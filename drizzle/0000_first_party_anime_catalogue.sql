CREATE TABLE "anime_alternative_titles" (
	"id" integer GENERATED ALWAYS AS IDENTITY (sequence name "anime_alternative_titles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"catalogue_item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "anime_alternative_titles_pkey" PRIMARY KEY("id"),
	CONSTRAINT "anime_alternative_titles_catalogue_item_id_title_key" UNIQUE("catalogue_item_id","title"),
	CONSTRAINT "anime_alternative_titles_catalogue_item_id_position_key" UNIQUE("catalogue_item_id","position"),
	CONSTRAINT "anime_alternative_titles_title_non_blank_check" CHECK ("anime_alternative_titles"."title" ~ '[^[:space:]]'),
	CONSTRAINT "anime_alternative_titles_position_check" CHECK ("anime_alternative_titles"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "anime_catalogue_items" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"english_title" text,
	"romaji_title" text,
	"original_title" text,
	"format" text NOT NULL,
	"release_status" text NOT NULL,
	"release_year" smallint,
	"episode_count" integer,
	"maturity" text NOT NULL,
	"catalogue_state" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_catalogue_items_pkey" PRIMARY KEY("id"),
	CONSTRAINT "anime_catalogue_items_id_uuid_v4_check" CHECK (substring("anime_catalogue_items"."id"::text, 15, 1) = '4' and substring("anime_catalogue_items"."id"::text, 20, 1) in ('8', '9', 'a', 'b')),
	CONSTRAINT "anime_catalogue_items_primary_title_check" CHECK ("anime_catalogue_items"."english_title" is not null or "anime_catalogue_items"."romaji_title" is not null or "anime_catalogue_items"."original_title" is not null),
	CONSTRAINT "anime_catalogue_items_english_title_non_blank_check" CHECK ("anime_catalogue_items"."english_title" ~ '[^[:space:]]'),
	CONSTRAINT "anime_catalogue_items_romaji_title_non_blank_check" CHECK ("anime_catalogue_items"."romaji_title" ~ '[^[:space:]]'),
	CONSTRAINT "anime_catalogue_items_original_title_non_blank_check" CHECK ("anime_catalogue_items"."original_title" ~ '[^[:space:]]'),
	CONSTRAINT "anime_catalogue_items_format_check" CHECK ("anime_catalogue_items"."format" in ('tv', 'movie', 'ova', 'ona', 'special', 'unknown')),
	CONSTRAINT "anime_catalogue_items_release_status_check" CHECK ("anime_catalogue_items"."release_status" in ('upcoming', 'airing', 'finished', 'unknown')),
	CONSTRAINT "anime_catalogue_items_release_year_check" CHECK ("anime_catalogue_items"."release_year" between 1 and 9999),
	CONSTRAINT "anime_catalogue_items_episode_count_check" CHECK ("anime_catalogue_items"."episode_count" > 0),
	CONSTRAINT "anime_catalogue_items_maturity_check" CHECK ("anime_catalogue_items"."maturity" in ('safe', 'sensitive', 'adult', 'unknown')),
	CONSTRAINT "anime_catalogue_items_catalogue_state_check" CHECK ("anime_catalogue_items"."catalogue_state" in ('draft', 'published', 'hidden')),
	CONSTRAINT "anime_catalogue_items_timestamp_order_check" CHECK ("anime_catalogue_items"."updated_at" >= "anime_catalogue_items"."created_at")
);
--> statement-breakpoint
CREATE TABLE "anime_catalogue_sources" (
	"catalogue_item_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"source_item_id" text NOT NULL,
	"first_seen_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_catalogue_sources_pkey" PRIMARY KEY("source_key","source_item_id"),
	CONSTRAINT "anime_catalogue_sources_source_key_check" CHECK ("anime_catalogue_sources"."source_key" ~ '^[a-z][a-z0-9_-]{0,49}$'),
	CONSTRAINT "anime_catalogue_sources_source_item_id_non_blank_check" CHECK ("anime_catalogue_sources"."source_item_id" ~ '[^[:space:]]'),
	CONSTRAINT "anime_catalogue_sources_timestamp_order_check" CHECK ("anime_catalogue_sources"."last_seen_at" >= "anime_catalogue_sources"."first_seen_at")
);
--> statement-breakpoint
ALTER TABLE "anime_alternative_titles" ADD CONSTRAINT "anime_alternative_titles_catalogue_item_id_fkey" FOREIGN KEY ("catalogue_item_id") REFERENCES "public"."anime_catalogue_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_catalogue_sources" ADD CONSTRAINT "anime_catalogue_sources_catalogue_item_id_fkey" FOREIGN KEY ("catalogue_item_id") REFERENCES "public"."anime_catalogue_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_catalogue_sources_catalogue_item_id_idx" ON "anime_catalogue_sources" USING btree ("catalogue_item_id");