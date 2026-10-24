ALTER TABLE "mcp_servers" ADD COLUMN "last_error_http_status" integer;--> statement-breakpoint
UPDATE "mcp_servers" SET "last_error_http_status" = 401 WHERE "last_error" LIKE '%(HTTP 401)%';