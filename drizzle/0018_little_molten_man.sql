CREATE TABLE "discord_link_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_links" (
	"discord_user_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"discord_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_link_codes" ADD CONSTRAINT "discord_link_codes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_links" ADD CONSTRAINT "discord_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_link_codes_user_idx" ON "discord_link_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discord_link_codes_hash_idx" ON "discord_link_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "discord_link_codes_expires_idx" ON "discord_link_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_links_user_uidx" ON "discord_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discord_links_user_idx" ON "discord_links" USING btree ("user_id");