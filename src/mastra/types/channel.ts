import { z } from 'zod';

export const channelSchema = z.looseObject({
  botUserId: z.string().optional(),
  channelId: z.string().optional(),
  eventType: z.string().optional(),
  // TODO(slopradar): one canonical source : optional isDM forces `=== true` normalisation at three call sites (agents/orchestrator.ts:123, prompts/index.ts:21, mcp/user-servers/approval.ts:9) → `z.boolean().default(false)` and read `ctx.isDM` directly
  isDM: z.boolean().optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export type ChannelContext = z.infer<typeof channelSchema>;
