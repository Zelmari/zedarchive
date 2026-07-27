CREATE TABLE "account_purge_run_heartbeats" (
	"singleton" boolean PRIMARY KEY NOT NULL,
	"run_id" uuid,
	"revision" bigint NOT NULL,
	"started_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"result_category" text NOT NULL,
	"examined_count" integer NOT NULL,
	"purged_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"failed_count" integer NOT NULL,
	CONSTRAINT "account_purge_run_heartbeats_singleton_check" CHECK ("account_purge_run_heartbeats"."singleton"),
	CONSTRAINT "account_purge_run_heartbeats_revision_check" CHECK ("account_purge_run_heartbeats"."revision" >= 0),
	CONSTRAINT "account_purge_run_heartbeats_result_category_check" CHECK ("account_purge_run_heartbeats"."result_category" in ('never_started', 'running', 'completed', 'completed_backlog', 'completed_with_failures', 'time_budget_exhausted', 'fatal_failure')),
	CONSTRAINT "account_purge_run_heartbeats_count_check" CHECK ("account_purge_run_heartbeats"."examined_count" >= 0 and "account_purge_run_heartbeats"."purged_count" >= 0 and "account_purge_run_heartbeats"."skipped_count" >= 0 and "account_purge_run_heartbeats"."failed_count" >= 0),
	CONSTRAINT "account_purge_run_heartbeats_state_check" CHECK (
        (
          "account_purge_run_heartbeats"."result_category" = 'never_started'
          and "account_purge_run_heartbeats"."revision" = 0
          and "account_purge_run_heartbeats"."run_id" is null
          and "account_purge_run_heartbeats"."started_at" is null
          and "account_purge_run_heartbeats"."completed_at" is null
          and "account_purge_run_heartbeats"."examined_count" = 0
          and "account_purge_run_heartbeats"."purged_count" = 0
          and "account_purge_run_heartbeats"."skipped_count" = 0
          and "account_purge_run_heartbeats"."failed_count" = 0
        )
        or (
          "account_purge_run_heartbeats"."result_category" = 'running'
          and "account_purge_run_heartbeats"."run_id" is not null
          and "account_purge_run_heartbeats"."started_at" is not null
          and "account_purge_run_heartbeats"."completed_at" is null
          and "account_purge_run_heartbeats"."examined_count" = 0
          and "account_purge_run_heartbeats"."purged_count" = 0
          and "account_purge_run_heartbeats"."skipped_count" = 0
          and "account_purge_run_heartbeats"."failed_count" = 0
        )
        or (
          "account_purge_run_heartbeats"."result_category" in ('completed', 'completed_backlog', 'completed_with_failures', 'time_budget_exhausted', 'fatal_failure')
          and "account_purge_run_heartbeats"."run_id" is not null
          and "account_purge_run_heartbeats"."started_at" is not null
          and "account_purge_run_heartbeats"."completed_at" is not null
          and "account_purge_run_heartbeats"."completed_at" >= "account_purge_run_heartbeats"."started_at"
          and "account_purge_run_heartbeats"."examined_count" = "account_purge_run_heartbeats"."purged_count" + "account_purge_run_heartbeats"."skipped_count" + "account_purge_run_heartbeats"."failed_count"
        )
      )
);
--> statement-breakpoint
INSERT INTO "account_purge_run_heartbeats" (
  "singleton",
  "revision",
  "result_category",
  "examined_count",
  "purged_count",
  "skipped_count",
  "failed_count"
) VALUES (true, 0, 'never_started', 0, 0, 0, 0);
