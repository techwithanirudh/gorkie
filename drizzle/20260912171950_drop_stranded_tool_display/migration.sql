-- `tool_display` is stranded: the tool-display work that added it was reverted,
-- so the column exists in any database that ran it but appears in neither
-- `schema.ts` nor the baseline snapshot. Because the snapshot never knew about
-- it, `drizzle-kit generate` cannot diff it away and emits nothing, so the drop
-- is written by hand. Verified unread: no match for `tool_display` or
-- `toolDisplay` anywhere in `src/`.
ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "tool_display";
