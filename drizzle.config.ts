import { defineConfig } from 'drizzle-kit';
import { z } from 'zod';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/mastra/db/schema.ts',
  out: './drizzle',
  // Scope drizzle-kit to gorkie's own tables. The same database holds Mastra's
  // tables (memory, channel state, schedules, background tasks), which drizzle
  // does not manage; without this, `db:push`/`db:check` would treat them as
  // drift and try to drop them.
  tablesFilter: [
    'github_credentials',
    'mcp_oauth',
    'mcp_servers',
    'moderation_events',
    'usage_turns',
    'user_settings',
  ],
  dbCredentials: { url: z.url().parse(process.env.DATABASE_URL) },
});
