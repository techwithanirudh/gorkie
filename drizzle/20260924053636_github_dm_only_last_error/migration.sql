ALTER TABLE "github_credentials" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "github_threads";