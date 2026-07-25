CREATE TABLE "account_deletion_requests" (
	"user_id" uuid NOT NULL,
	"requested_at" timestamp (3) with time zone NOT NULL,
	"purge_after" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY("user_id"),
	CONSTRAINT "account_deletion_requests_recovery_interval_check" CHECK ("account_deletion_requests"."purge_after" = "account_deletion_requests"."requested_at" + interval '14 days')
);
--> statement-breakpoint
CREATE TABLE "deletion_challenges" (
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"challenge_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code_digest" text NOT NULL,
	"code_expires_at" timestamp (3) with time zone NOT NULL,
	"reauthenticated_until" timestamp (3) with time zone NOT NULL,
	"failed_code_attempts" smallint DEFAULT 0 NOT NULL,
	"send_window_started_at" timestamp (3) with time zone NOT NULL,
	"send_count" smallint DEFAULT 1 NOT NULL,
	"last_sent_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_challenges_pkey" PRIMARY KEY("user_id"),
	CONSTRAINT "deletion_challenges_challenge_id_key" UNIQUE("challenge_id"),
	CONSTRAINT "deletion_challenges_digest_check" CHECK ("deletion_challenges"."code_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "deletion_challenges_failed_attempts_check" CHECK ("deletion_challenges"."failed_code_attempts" between 0 and 5),
	CONSTRAINT "deletion_challenges_send_count_check" CHECK ("deletion_challenges"."send_count" between 1 and 3),
	CONSTRAINT "deletion_challenges_expiry_check" CHECK ("deletion_challenges"."code_expires_at" > "deletion_challenges"."last_sent_at" and "deletion_challenges"."code_expires_at" <= "deletion_challenges"."reauthenticated_until"),
	CONSTRAINT "deletion_challenges_timestamp_order_check" CHECK ("deletion_challenges"."updated_at" >= "deletion_challenges"."created_at" and "deletion_challenges"."last_sent_at" >= "deletion_challenges"."send_window_started_at")
);
--> statement-breakpoint
DO $preflight$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "verifications" AS "verification"
		WHERE "verification"."identifier" LIKE 'reset-password:%'
			AND (
				"verification"."value" !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
				OR NOT EXISTS (
					SELECT 1
					FROM "users" AS "owner"
					WHERE "owner"."id"::text = lower("verification"."value")
				)
			)
	) THEN
		RAISE EXCEPTION 'Cannot add reset verification owner: malformed or orphaned reset-password rows exist';
	END IF;
END
$preflight$;
--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "reset_owner_user_id" uuid GENERATED ALWAYS AS (CASE WHEN "identifier" LIKE 'reset-password:%' THEN "value"::uuid ELSE NULL END) STORED;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_challenges" ADD CONSTRAINT "deletion_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_challenges" ADD CONSTRAINT "deletion_challenges_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_requests_purge_after_user_id_idx" ON "account_deletion_requests" USING btree ("purge_after","user_id");--> statement-breakpoint
CREATE INDEX "deletion_challenges_session_id_idx" ON "deletion_challenges" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_reset_owner_user_id_fkey" FOREIGN KEY ("reset_owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verifications_reset_owner_user_id_idx" ON "verifications" USING btree ("reset_owner_user_id") WHERE "verifications"."reset_owner_user_id" is not null;
