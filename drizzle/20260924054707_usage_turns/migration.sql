CREATE TABLE "usage_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_turns_user_idx" ON "usage_turns" ("user_id","created_at");