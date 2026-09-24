DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_servers_pk') THEN
    ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_pk" PRIMARY KEY ("user_id", "name");
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "mcp_oauth" (
	"user_id" text,
	"server_name" text,
	"key" text,
	"value" text NOT NULL,
	CONSTRAINT "mcp_oauth_pk" PRIMARY KEY("user_id","server_name","key")
);
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "oauth_status" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "oauth_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mcp_oauth" ADD CONSTRAINT "mcp_oauth_server_fk" FOREIGN KEY ("user_id","server_name") REFERENCES "mcp_servers"("user_id","name") ON DELETE CASCADE;