import { z } from 'zod';
import type { ApprovalLevel } from './approval';

const TOOL_PERMISSIONS = [
  'all',
  'write',
  'delete',
] as const satisfies readonly ApprovalLevel[];

export type ToolPermission = (typeof TOOL_PERMISSIONS)[number];

// TODO(slopradar): weak fallback : `.catch('write')` also parses modal input (chat/app-home/mcp/actions.ts:207), turning an invalid submit into 'write' silently → plain enum for input, default only at the DB read (db/queries/mcps.ts:26)
export const toolPermissionSchema = z.enum(TOOL_PERMISSIONS).catch('write');

export const mcpServerSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Letters, numbers, dashes, and underscores only.'
    ),
  url: z.url(),
  token: z.string().min(1).max(2000).optional(),
  permission: toolPermissionSchema.default('write'),
  threads: z.boolean().default(true),
});

export type MCPServerConfig = z.infer<typeof mcpServerSchema>;

export const mcpOAuthStatusSchema = z.enum([
  'disconnected',
  'connected',
  'needs-auth',
]);

export type MCPOAuthStatus = z.infer<typeof mcpOAuthStatusSchema>;

export type StoredMCPServer = MCPServerConfig & {
  credentialError?: string;
  lastError?: string;
  oauth?: { connectedAt?: Date; status: MCPOAuthStatus };
};
