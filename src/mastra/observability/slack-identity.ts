import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { SpanType } from '@mastra/core/observability';
import { z } from 'zod';

const channel = z.object({
  channelId: z.string().optional(),
  eventType: z.string().optional(),
  isDM: z.boolean().optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const slackIdentity: SpanOutputProcessor = {
  name: 'slack-identity',
  process(span?: AnySpan): AnySpan | undefined {
    if (!span || span.type !== SpanType.AGENT_RUN || span.getParentSpanId()) {
      return span;
    }
    const context = span.requestContext;
    if (!(context && typeof context === 'object' && 'channel' in context)) {
      return span;
    }
    const parsed = channel.safeParse(context.channel);
    if (!parsed.success) {
      return span;
    }
    const slack = parsed.data;
    span.metadata = {
      ...span.metadata,
      channelId: slack.channelId,
      eventType: slack.eventType,
      isDM: slack.isDM,
      messageId: slack.messageId,
      sessionId: slack.threadId,
      userId: slack.userId,
      userName: slack.userName,
    };
    return span;
  },
  shutdown() {
    return Promise.resolve();
  },
};
