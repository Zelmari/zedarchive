CREATE TABLE "media_activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"media_id" text NOT NULL,
	"action_type" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "status" text DEFAULT 'in_progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "rewatch_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "synopsis" text;--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "genres" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "theme" text DEFAULT 'parchment' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "media_activity_logs" ADD CONSTRAINT "media_activity_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_activity_logs" ADD CONSTRAINT "media_activity_logs_media_id_media_entries_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_id_idx" ON "media_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_created_at_idx" ON "media_activity_logs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");