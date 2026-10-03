import type { ChannelContext as MastraChannelContext } from '@mastra/core/channels';
import { z } from 'zod';

export const channelSchema = z.looseObject({
  botUserId: z.string().optional(),
  channelId: z.string().optional(),
  eventType: z.string().optional(),
  isDM: z.boolean().default(false),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
}) satisfies z.ZodType<Partial<MastraChannelContext>>;

export type ChannelContext = z.infer<typeof channelSchema>;
