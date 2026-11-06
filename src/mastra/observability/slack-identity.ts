import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { SpanType } from '@mastra/core/observability';
import { channelSchema } from '../types';

export const slackIdentity: SpanOutputProcessor = {
  name: 'slack-identity',
  process(span?: AnySpan): AnySpan | undefined {
    if (!span) {
      return span;
    }

    // A resumed or woken run starts a new root span that links back to the
    // suspended one through `parentSpanId`, so `getParentSpanId()` is set even
    // though nothing in this process parents it. `isRootSpan` covers both, and
    // without the stamp Langfuse falls back to the Mastra thread UUID and the
    // resumed turn overwrites the trace's Slack session.
    const parsed =
      span.type === SpanType.AGENT_RUN && span.isRootSpan
        ? channelSchema.safeParse(span.requestContext?.channel)
        : undefined;
    // Request context carries Mastra's channel render entry, whose Slack adapter
    // holds SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET, and anything else a turn stashes
    // there later. Drop it from every exported span rather than trust key- or
    // field-name redaction. Only the span's reference goes: the running turn
    // reads its own RequestContext, not this snapshot.
    Reflect.deleteProperty(span, 'requestContext');
    if (!parsed?.success) {
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
