CREATE TABLE "external_api_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cycle_number" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"rating" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_entry_tags" (
	"media_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"speaker" text,
	"citation" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stack_items" (
	"id" text PRIMARY KEY NOT NULL,
	"stack_id" text NOT NULL,
	"media_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"annotation" text
);
--> statement-breakpoint
CREATE TABLE "stacks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"target" integer NOT NULL,
	"category" "media_category" DEFAULT 'book' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_entries" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media_cycles" ADD CONSTRAINT "media_cycles_media_id_media_entries_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_cycles" ADD CONSTRAINT "media_cycles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_entry_tags" ADD CONSTRAINT "media_entry_tags_media_id_media_entries_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_entry_tags" ADD CONSTRAINT "media_entry_tags_tag_id_media_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."media_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_quotes" ADD CONSTRAINT "media_quotes_media_id_media_entries_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_quotes" ADD CONSTRAINT "media_quotes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stack_items" ADD CONSTRAINT "stack_items_stack_id_stacks_id_fk" FOREIGN KEY ("stack_id") REFERENCES "public"."stacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stack_items" ADD CONSTRAINT "stack_items_media_id_media_entries_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stacks" ADD CONSTRAINT "stacks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cycles_media_id_idx" ON "media_cycles" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "cycles_user_completed_idx" ON "media_cycles" USING btree ("user_id","completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entry_tags_media_idx" ON "media_entry_tags" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "entry_tags_tag_idx" ON "media_entry_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "quotes_media_id_idx" ON "media_quotes" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "quotes_user_favorite_idx" ON "media_quotes" USING btree ("user_id","is_favorite");--> statement-breakpoint
CREATE INDEX "media_tags_user_idx" ON "media_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_tags_user_name_idx" ON "media_tags" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "stacks_user_slug_idx" ON "stacks" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "goals_user_period_idx" ON "user_goals" USING btree ("user_id","period");--> statement-breakpoint
CREATE INDEX "integrations_user_provider_idx" ON "user_integrations" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "media_entries_user_public_idx" ON "media_entries" USING btree ("user_id","is_private","updated_at" DESC NULLS LAST);