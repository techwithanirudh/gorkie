import type { RequestContext } from '@mastra/core/request-context';
import { channelContext } from '../lib/context';

export function contextPrompt(requestContext: RequestContext): string {
  const ctx = channelContext(requestContext);
  if (!(ctx.channelId || ctx.threadId || ctx.userId)) {
    return '';
  }
  const lines: string[] = [];
  if (ctx.channelId) {
    lines.push(`The current channel id is ${ctx.channelId}.`);
  }
  if (ctx.threadId) {
    lines.push(`The current thread id is ${ctx.threadId}.`);
  }
  if (ctx.userId) {
    const named = ctx.userName ? ` (${ctx.userName})` : '';
    lines.push(
      `The message being answered was sent by Slack user ${ctx.userId}${named}; "me", "my" and "mine" refer to them. Other people may speak later in this thread, so re-read the sender rather than assuming it is still this person.`
    );
  }
  return `<context>\n${lines.join('\n')}\n</context>`;
}
