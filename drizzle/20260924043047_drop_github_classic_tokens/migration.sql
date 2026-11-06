DELETE FROM "github_credentials" WHERE "kind" = 'pat';--> statement-breakpoint
ALTER TABLE "github_credentials" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "github_credentials" DROP COLUMN "scopes";
