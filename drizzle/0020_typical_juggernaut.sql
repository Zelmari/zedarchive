CREATE TABLE "assistant_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"outcome" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_message_id" text NOT NULL,
	"actions" jsonb NOT NULL,
	"before_image" jsonb NOT NULL,
	"summary" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"applied_at" timestamp,
	"undone_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"usage_day" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"reserved_micros" integer DEFAULT 0 NOT NULL,
	"spent_micros" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_events" ADD CONSTRAINT "assistant_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_events_user_created_idx" ON "assistant_events" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_proposals_user_message_uidx" ON "assistant_proposals" USING btree ("user_id","client_message_id");--> statement-breakpoint
CREATE INDEX "assistant_proposals_user_created_idx" ON "assistant_proposals" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_usage_user_day_uidx" ON "assistant_usage" USING btree ("user_id","usage_day");