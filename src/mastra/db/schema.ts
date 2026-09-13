import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { GitHubPermission, ToolPermission } from '../types';

export const githubCredentials = pgTable('github_credentials', {
  userId: text('user_id').primaryKey(),
  kind: text('kind').$type<'app' | 'pat'>().notNull(),
  login: text('login').notNull(),
  token: text('token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scopes: text('scopes'),
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
