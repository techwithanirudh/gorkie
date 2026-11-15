import { RequestContext } from '@mastra/core/request-context';
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

// Tool approval predicates get a plain-object view of the request context.
export function channelContext(
  requestContext?: RequestContext | Record<string, unknown>
): ChannelContext {
  const raw =
    requestContext instanceof RequestContext
      ? requestContext.get('channel')
      : requestContext?.channel;
  if (!raw) {
    return {};
  }
  // Slack sets `channel` as an object, but the Studio/API request-context
  // boundary serializes it to a JSON string, so parse that back first.
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
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
