CREATE TABLE "username_change_challenges" (
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"challenge_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"proposed_username" text NOT NULL,
	"proposed_username_identity_key" text NOT NULL,
	"code_digest" text NOT NULL,
	"code_expires_at" timestamp (3) with time zone NOT NULL,
	"reauthenticated_until" timestamp (3) with time zone NOT NULL,
	"failed_code_attempts" smallint DEFAULT 0 NOT NULL,
	"send_window_started_at" timestamp (3) with time zone NOT NULL,
	"send_count" smallint DEFAULT 1 NOT NULL,
	"last_sent_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "username_change_challenges_pkey" PRIMARY KEY("user_id"),
	CONSTRAINT "username_change_challenges_challenge_id_key" UNIQUE("challenge_id"),
	CONSTRAINT "username_change_challenges_proposed_username_check" CHECK ("username_change_challenges"."proposed_username" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,18}[A-Za-z0-9]$'),
	CONSTRAINT "username_change_challenges_proposed_key_check" CHECK ("username_change_challenges"."proposed_username_identity_key" = lower("username_change_challenges"."proposed_username")),
	CONSTRAINT "username_change_challenges_digest_check" CHECK ("username_change_challenges"."code_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "username_change_challenges_failed_attempts_check" CHECK ("username_change_challenges"."failed_code_attempts" between 0 and 5),
	CONSTRAINT "username_change_challenges_send_count_check" CHECK ("username_change_challenges"."send_count" between 1 and 3),
	CONSTRAINT "username_change_challenges_expiry_check" CHECK ("username_change_challenges"."code_expires_at" > "username_change_challenges"."last_sent_at" and "username_change_challenges"."code_expires_at" <= "username_change_challenges"."reauthenticated_until"),
	CONSTRAINT "username_change_challenges_timestamp_order_check" CHECK ("username_change_challenges"."updated_at" >= "username_change_challenges"."created_at" and "username_change_challenges"."last_sent_at" >= "username_change_challenges"."send_window_started_at")
);
--> statement-breakpoint
CREATE TABLE "username_change_records" (
	"user_id" uuid NOT NULL,
	"changed_at" timestamp (3) with time zone NOT NULL,
	"previous_username_identity_key" text,
	"previous_username_reserved_until" timestamp (3) with time zone,
	CONSTRAINT "username_change_records_pkey" PRIMARY KEY("user_id"),
	CONSTRAINT "username_change_records_reservation_pair_check" CHECK (("username_change_records"."previous_username_identity_key" is null) = ("username_change_records"."previous_username_reserved_until" is null)),
	CONSTRAINT "username_change_records_previous_key_check" CHECK ("username_change_records"."previous_username_identity_key" is null or ("username_change_records"."previous_username_identity_key" ~ '^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$')),
	CONSTRAINT "username_change_records_reservation_order_check" CHECK ("username_change_records"."previous_username_reserved_until" is null or "username_change_records"."previous_username_reserved_until" > "username_change_records"."changed_at"),
	CONSTRAINT "username_change_records_reservation_interval_check" CHECK ("username_change_records"."previous_username_reserved_until" is null or "username_change_records"."previous_username_reserved_until" = "username_change_records"."changed_at" + interval '14 days')
);
--> statement-breakpoint
ALTER TABLE "username_change_challenges" ADD CONSTRAINT "username_change_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "username_change_challenges" ADD CONSTRAINT "username_change_challenges_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "username_change_records" ADD CONSTRAINT "username_change_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "username_change_challenges_session_id_idx" ON "username_change_challenges" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "username_change_records_previous_key_reserved_until_idx" ON "username_change_records" USING btree ("previous_username_identity_key","previous_username_reserved_until") WHERE "username_change_records"."previous_username_identity_key" is not null;
--> statement-breakpoint
CREATE FUNCTION "lock_username_identity_key"("identity_key" text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('zedarchive/username-change/v1:' || "identity_key", 0)
  );
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "enforce_user_username_reservation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "lock_username_identity_key"(NEW.username_identity_key);

  IF EXISTS (
    SELECT 1
    FROM "username_change_records"
    WHERE previous_username_identity_key = NEW.username_identity_key
      AND previous_username_reserved_until > clock_timestamp()
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'username_identity_key_reserved';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "enforce_username_change_record_reservation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.previous_username_identity_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM "lock_username_identity_key"(NEW.previous_username_identity_key);

  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE username_identity_key = NEW.previous_username_identity_key
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'username_change_records_previous_key_active';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "reject_username_change_record_update"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    CONSTRAINT = 'username_change_records_immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "users_username_reservation_trigger"
BEFORE INSERT OR UPDATE OF "username_identity_key" ON "users"
FOR EACH ROW EXECUTE FUNCTION "enforce_user_username_reservation"();
--> statement-breakpoint
CREATE TRIGGER "username_change_records_reservation_trigger"
BEFORE INSERT ON "username_change_records"
FOR EACH ROW EXECUTE FUNCTION "enforce_username_change_record_reservation"();
--> statement-breakpoint
CREATE TRIGGER "username_change_records_immutable_trigger"
BEFORE UPDATE ON "username_change_records"
FOR EACH ROW EXECUTE FUNCTION "reject_username_change_record_update"();
