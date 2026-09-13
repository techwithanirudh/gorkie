-- The baseline is `CREATE TABLE IF NOT EXISTS`, so it is a no-op on a database
-- that already ran the old hand-rolled `createTables()`. Those tables were
-- created WITHOUT these three columns: they were added later by an
-- `add column if not exists` block that only ever existed on this branch and
-- never shipped. On any database created from `main` the baseline therefore
-- leaves them missing, and every read of them fails with `column does not
-- exist` (silently, because most call sites catch). Add them idempotently.
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "permission" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "github_permission" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "github_threads" boolean;
