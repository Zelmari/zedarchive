CREATE TABLE "accounts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp (3) with time zone,
	"refresh_token_expires_at" timestamp (3) with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_pkey" PRIMARY KEY("id"),
	CONSTRAINT "accounts_provider_id_account_id_key" UNIQUE("provider_id","account_id"),
	CONSTRAINT "accounts_account_id_non_blank_check" CHECK ("accounts"."account_id" ~ '[^[:space:]]'),
	CONSTRAINT "accounts_provider_id_non_blank_check" CHECK ("accounts"."provider_id" ~ '[^[:space:]]'),
	CONSTRAINT "accounts_timestamp_order_check" CHECK ("accounts"."updated_at" >= "accounts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_pkey" PRIMARY KEY("id"),
	CONSTRAINT "rate_limits_key_key" UNIQUE("key"),
	CONSTRAINT "rate_limits_key_non_blank_check" CHECK ("rate_limits"."key" ~ '[^[:space:]]'),
	CONSTRAINT "rate_limits_count_non_negative_check" CHECK ("rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_pkey" PRIMARY KEY("id"),
	CONSTRAINT "sessions_token_key" UNIQUE("token"),
	CONSTRAINT "sessions_token_non_blank_check" CHECK ("sessions"."token" ~ '[^[:space:]]'),
	CONSTRAINT "sessions_timestamp_order_check" CHECK ("sessions"."updated_at" >= "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"username_identity_key" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_pkey" PRIMARY KEY("id"),
	CONSTRAINT "users_username_identity_key_key" UNIQUE("username_identity_key"),
	CONSTRAINT "users_username_non_blank_check" CHECK ("users"."username" ~ '[^[:space:]]'),
	CONSTRAINT "users_username_length_check" CHECK (char_length("users"."username") between 3 and 20),
	CONSTRAINT "users_username_identity_key_non_blank_check" CHECK ("users"."username_identity_key" ~ '[^[:space:]]'),
	CONSTRAINT "users_username_identity_key_length_check" CHECK (char_length("users"."username_identity_key") between 3 and 20),
	CONSTRAINT "users_username_identity_key_matches_username_check" CHECK ("users"."username_identity_key" = lower("users"."username")),
	CONSTRAINT "users_email_non_blank_check" CHECK ("users"."email" ~ '[^[:space:]]'),
	CONSTRAINT "users_timestamp_order_check" CHECK ("users"."updated_at" >= "users"."created_at")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifications_pkey" PRIMARY KEY("id"),
	CONSTRAINT "verifications_identifier_non_blank_check" CHECK ("verifications"."identifier" ~ '[^[:space:]]'),
	CONSTRAINT "verifications_value_non_blank_check" CHECK ("verifications"."value" ~ '[^[:space:]]'),
	CONSTRAINT "verifications_timestamp_order_check" CHECK ("verifications"."updated_at" >= "verifications"."created_at")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uidx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verifications_expires_at_idx" ON "verifications" USING btree ("expires_at");