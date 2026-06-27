import type { RequestContext } from '@mastra/core/request-context';
import { channelContext } from '../types';

export function contextPrompt(requestContext: RequestContext): string {
  const ctx = channelContext(requestContext);
  if (!ctx.channelId && !ctx.threadId) return '';
  const lines: string[] = [];
  if (ctx.channelId) lines.push(`The current channel id is ${ctx.channelId}.`);
  if (ctx.threadId) lines.push(`The current thread id is ${ctx.threadId}.`);
  return `<context>\n${lines.join('\n')}\n</context>`;
}
