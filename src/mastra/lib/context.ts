import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import type { ChannelContext } from '../types';
import { logger } from './logger';

const channelSchema = z.looseObject({
  botUserId: z.string().optional(),
  channelId: z.string().optional(),
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
  const parsed = channelSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn('[context] channel context did not match its shape', {
      issues: parsed.error.issues,
    });
    return {};
  }
  return parsed.data;
}
