import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { SpanType } from '@mastra/core/observability';
import { channelSchema } from '../lib/context';

// Mastra stashes its live channel render context under this key, and that object
// holds the Slack adapter carrying SLACK_BOT_TOKEN and SLACK_APP_TOKEN.
// `RequestContext.serializeForSpan` passes plain objects through by reference, so
// the render context reaches the span exporters: drop the whole entry here rather
// than trust field-name redaction to catch every token nested in the adapter.
// Mirrors `@mastra/core`'s CHAT_CHANNEL_RENDER_CONTEXT_KEY, which is not
// re-exported from a public entry point, so the literal is duplicated.
const RENDER_KEY = '__mastra_chat_channel_render';

export const slackIdentity: SpanOutputProcessor = {
  name: 'slack-identity',
  process(span?: AnySpan): AnySpan | undefined {
    if (!span) {
      return span;
    }

    const context = span.requestContext;
    if (context && typeof context === 'object' && RENDER_KEY in context) {
      // Copy rather than mutate: under realtime export the running turn still reads the render adapter from this context.
      const sanitized = { ...context };
      Reflect.deleteProperty(sanitized, RENDER_KEY);
      span.requestContext = sanitized;
    }

    if (span.type !== SpanType.AGENT_RUN || span.getParentSpanId()) {
      return span;
    }
    const parsed = channelSchema.safeParse(span.requestContext?.channel);
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
