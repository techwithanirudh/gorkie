-- TODO(slopradar): review: migration churn (owner question) | main has no drizzle folder and no github_credentials table, yet this chain adds kind/scopes here and drops them in 20260924043047, drops tool_display (20260912171950) and re-adds it (20260924044806), drops github_threads (20260924053636) and re-adds it (20260924062558) | if only dev DBs ran these, squash into one baseline generated from schema.ts (keep the IF NOT EXISTS adoption of main's kysely tables and the thread-id rewrite) before merge
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
