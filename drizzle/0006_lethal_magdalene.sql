ALTER TABLE "user" ADD COLUMN "verification_dismissed_at" timestamp;
UPDATE "user" SET email_verified = true WHERE created_at < now() - interval '1 minute' AND email_verified = false;