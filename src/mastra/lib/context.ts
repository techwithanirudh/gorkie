import type { RequestContext } from '@mastra/core/request-context';
import { type ChannelContext, channelSchema } from '../types';
import { logger } from './logger';

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
