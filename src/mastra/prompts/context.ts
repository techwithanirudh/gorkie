import type { RequestContext } from '@mastra/core/request-context';
import type { ChannelContext } from '../types';

// Thread-stable only (channel + thread id). No timestamp and no speaker: those
// change every turn and would break the conversation's prompt cache. The speaker
// already travels in the message body via channels' multi-user attributes.
export function contextPrompt(requestContext: RequestContext): string {
  const ctx = requestContext.get('channel') as ChannelContext | undefined;
  if (!ctx?.channelId && !ctx?.threadId) return '';
  const lines: string[] = [];
  if (ctx.channelId) lines.push(`The current channel id is ${ctx.channelId}.`);
  if (ctx.threadId) lines.push(`The current thread id is ${ctx.threadId}.`);
  return `<context>\n${lines.join('\n')}\n</context>`;
}
