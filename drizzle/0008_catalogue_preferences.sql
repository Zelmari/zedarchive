CREATE TABLE "user_catalogue_preferences" (
	"user_id" uuid NOT NULL,
	"title_language" text DEFAULT 'english' NOT NULL,
	"adult_content_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_catalogue_preferences_pkey" PRIMARY KEY("user_id"),
	CONSTRAINT "user_catalogue_preferences_title_language_check" CHECK ("user_catalogue_preferences"."title_language" in ('english', 'romaji', 'original')),
	CONSTRAINT "user_catalogue_preferences_timestamp_order_check" CHECK ("user_catalogue_preferences"."updated_at" >= "user_catalogue_preferences"."created_at")
);
--> statement-breakpoint
ALTER TABLE "user_catalogue_preferences" ADD CONSTRAINT "user_catalogue_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
