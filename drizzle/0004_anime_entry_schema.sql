CREATE TABLE "anime_entries" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalogue_item_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_entries_pkey" PRIMARY KEY("id"),
	CONSTRAINT "anime_entries_user_id_catalogue_item_id_key" UNIQUE("user_id","catalogue_item_id"),
	CONSTRAINT "anime_entries_id_uuid_v4_check" CHECK (substring("anime_entries"."id"::text, 15, 1) = '4' and substring("anime_entries"."id"::text, 20, 1) in ('8', '9', 'a', 'b')),
	CONSTRAINT "anime_entries_status_check" CHECK ("anime_entries"."status" in ('planned', 'in_progress', 'on_hold', 'dropped', 'completed')),
	CONSTRAINT "anime_entries_timestamp_order_check" CHECK ("anime_entries"."updated_at" >= "anime_entries"."created_at")
);
--> statement-breakpoint
ALTER TABLE "anime_entries" ADD CONSTRAINT "anime_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_entries" ADD CONSTRAINT "anime_entries_catalogue_item_id_fkey" FOREIGN KEY ("catalogue_item_id") REFERENCES "public"."anime_catalogue_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_entries_catalogue_item_id_idx" ON "anime_entries" USING btree ("catalogue_item_id");