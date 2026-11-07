import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  GitHubPermission,
  ModerationAction,
  ToolPermission,
} from '../types';

export const githubCredentials = pgTable('github_credentials', {
  userId: text('user_id').primaryKey(),
  login: text('login').notNull(),
  token: text('token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mcpServers = pgTable(
  'mcp_servers',
  {
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    token: text('token'),
    permission: text('permission').$type<ToolPermission>(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.name], name: 'mcp_servers_pk' }),
  ]
);

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  instructions: text('instructions'),
  githubPermission: text('github_permission').$type<GitHubPermission>(),
  githubThreads: boolean('github_threads'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usage = pgTable(
  'usage',
  {
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    used: integer('used').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.kind], name: 'usage_pk' }),
  ]
);

export const moderationEvents = pgTable(
  'moderation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').$type<ModerationAction>().notNull(),
    userId: text('user_id').notNull(),
    actorId: text('actor_id').notNull(),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('moderation_events_user_idx').on(table.userId, table.createdAt),
  ]
);
