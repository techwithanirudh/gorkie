import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  GitHubPermission,
  MCPOAuthStatus,
  ModerationAction,
  ToolDisplayMode,
  ToolPermission,
} from '../types';

export const githubCredentials = pgTable('github_credentials', {
  userId: text('user_id').primaryKey(),
  login: text('login').notNull(),
  token: text('token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastError: text('last_error'),
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
    oauthStatus: text('oauth_status').$type<MCPOAuthStatus>(),
    oauthConnectedAt: timestamp('oauth_connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.name], name: 'mcp_servers_pk' }),
  ]
);

export const mcpOAuth = pgTable(
  'mcp_oauth',
  {
    userId: text('user_id').notNull(),
    serverName: text('server_name').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.serverName, table.key],
      name: 'mcp_oauth_pk',
    }),
    foreignKey({
      columns: [table.userId, table.serverName],
      foreignColumns: [mcpServers.userId, mcpServers.name],
      name: 'mcp_oauth_server_fk',
    }).onDelete('cascade'),
  ]
);

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  instructions: text('instructions'),
  githubPermission: text('github_permission').$type<GitHubPermission>(),
  toolDisplay: text('tool_display').$type<ToolDisplayMode>(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Append-only: the newest ban or unban row decides a user's state, and the rows
// together are the audit trail.
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
