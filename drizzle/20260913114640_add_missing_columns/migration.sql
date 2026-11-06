ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "permission" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "github_permission" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "github_threads" boolean;
