import { defineConfig } from 'drizzle-kit';

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
  // TODO(slopradar): AGENTS: never read process.env outside src/env.ts + weak fallback | reads process.env directly, and `?? ''` turns a missing variable into an opaque drizzle connection error | importing env would demand every bot secret for db:generate, so carve drizzle.config.ts out of the rule in AGENTS.md (owner question) and replace `?? ''` with `z.url().parse(process.env.DATABASE_URL)`
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
