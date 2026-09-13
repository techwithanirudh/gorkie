-- Baseline. These tables already exist in every deployed database, created by
-- the previous hand-rolled `createTables()`, so this migration has to be a
-- no-op there while still building them from scratch on a fresh one. Only this
-- one migration is edited by hand; every later one is generated.
CREATE TABLE IF NOT EXISTS "github_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"login" text NOT NULL,
	"token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scopes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_servers" (
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"token" text,
	"permission" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_servers_pk" PRIMARY KEY("user_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"instructions" text,
	"github_permission" text,
	"github_threads" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
