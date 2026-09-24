import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import type { ChannelContext } from '../types';
import { logger } from './logger';

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
