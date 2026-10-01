ALTER TABLE "mcp_servers" ADD COLUMN "threads" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "mcp_threads";