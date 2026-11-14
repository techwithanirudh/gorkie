DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'github_credentials' AND column_name = 'kind'
  ) THEN
    DELETE FROM "github_credentials" WHERE "kind" = 'pat';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "github_credentials" DROP COLUMN IF EXISTS "kind";--> statement-breakpoint
ALTER TABLE "github_credentials" DROP COLUMN IF EXISTS "scopes";
