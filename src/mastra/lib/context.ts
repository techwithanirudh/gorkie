import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import type { ChannelContext } from '../types';
import { logger } from './logger';

// TODO(slopradar): CODING_STANDARDS: types live in src/mastra/types/ | exported schema used by index.ts, observability/slack-identity.ts and mcp/user-servers/approval.ts, and a second hand-kept shape beside ChannelContext (Partial<MastraChannelContext>) in types/channel.ts | move channelSchema into types/channel.ts and tie the two together (`satisfies z.ZodType<ChannelContext>` or derive one from the other)
export const channelSchema = z.looseObject({
  botUserId: z.string().optional(),
  channelId: z.string().optional(),
  eventType: z.string().optional(),
  isDM: z.boolean().optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export function channelContext(
  requestContext?: RequestContext
): ChannelContext {
  const raw = requestContext?.get('channel');
  if (!raw) {
    return {};
  }
  let value: unknown = raw;
  // Studio's request-context presets reach the server with nested objects JSON-stringified.
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (error) {
      logger.warn('[context] channel context was not valid JSON', { error });
      return {};
    }
  }
  const parsed = channelSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn('[context] channel context did not match its shape', {
      issues: parsed.error.issues,
    });
    return {};
  }
  return parsed.data;
}
