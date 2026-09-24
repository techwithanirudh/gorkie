-- Classic personal tokens are no longer supported; those rows cannot be used
-- by the GitHub App web flow, so they go before the columns that described them.
DELETE FROM "github_credentials" WHERE "kind" = 'pat';--> statement-breakpoint
ALTER TABLE "github_credentials" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "github_credentials" DROP COLUMN "scopes";
