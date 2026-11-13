import { generateText, Output } from 'ai';
import type { Message, Thread } from 'chat';
import { gate as config } from '../config';
import { logger } from '../lib/logger';
import { gatePrompt } from '../prompts/gate';
import { gate as gateModel } from '../providers';
import { isComment, rawText } from './message';

const connectorFooter = /\s*\*Sent using\* <@[A-Z0-9_]+(?:\|[^>]*)?>\s*$/;
const offerPattern =
  /\b(want me to|should i|shall i|if you want|if you'd like|if you like|say the word|lmk if|let me know if)\b/i;

function awaitsReply(text: string): boolean {
  const trimmed = text
    .trim()
    .replace(/(?:\s*:[a-z0-9_+'-]+:)+$/i, '')
    .replace(/[\s)\]"'*_~`]+$/, '');
  if (trimmed.endsWith('?')) {
    return true;
  }
  const lastSentence = trimmed.split(/(?<=[.!?])\s+|\n+/).at(-1) ?? '';
  return offerPattern.test(lastSentence);
}

function render(message: Message): string {
  const author = message.author.isMe
    ? 'gorkie (bot)'
    : message.author.fullName || message.author.userName;
  return `${author}: ${message.text.slice(0, config.maxMessageChars)}`;
}

export async function shouldRespond({
  message,
  skipped,
  thread,
}: {
  message: Message;
  skipped: readonly Message[];
  thread: Thread;
}): Promise<boolean> {
  // Slack folds a connector's footer into text, which is not the sender mentioning anyone.
  const body = rawText(message).replace(connectorFooter, '');
  if (/<@[A-Z0-9_]+/.test(body)) {
    logger.debug('[chat] followed-thread message mentions someone else', {
      threadId: thread.id,
    });
    return false;
  }
  const newest = [...skipped, message];
  const newestIds = new Set(newest.map(({ id }) => id));
  const recent: Message[] = [];
  for await (const previous of thread.messages) {
    if (recent.length >= config.contextMessages) {
      break;
    }
    const isFooter = previous.author.isMe && /^_?done in /.test(previous.text);
    if (!(newestIds.has(previous.id) || isComment(previous) || isFooter)) {
      recent.push(previous);
    }
  }
  const [latest] = recent;
  if (latest?.author.isMe && awaitsReply(latest.text)) {
    return true;
  }
  const prompt = `<recent_messages>
${recent.reverse().map(render).join('\n') || '(none)'}
</recent_messages>

<newest_messages>
${newest.map(render).join('\n')}
</newest_messages>

Should gorkie respond to the newest messages?`;
  try {
    // Direct, because an Agent run costs several database round trips per step.
    const { output } = await generateText({
      model: gateModel,
      system: gatePrompt,
      prompt,
      output: Output.choice({ options: ['yes', 'no'] }),
      maxOutputTokens: config.maxTokens.output,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(config.timeoutMs),
    });
    const respond = output === 'yes';
    logger.info('[chat] relevance check', {
      respond,
      threadId: thread.id,
      messageId: message.id,
    });
    return respond;
  } catch (error) {
    logger.warn('[chat] relevance check failed, staying quiet', {
      error,
      threadId: thread.id,
    });
    return false;
  }
}
