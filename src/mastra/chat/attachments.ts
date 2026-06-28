import { RequestContext } from '@mastra/core/request-context';
import { E2BSandbox } from '@mastra/e2b';
import type { Message, Thread } from 'chat';
import { parseMarkdown } from 'chat';
import { logger } from '../lib/logger';
import { p } from '../lib/path';
import { workspace } from '../workspace';

const MAX_ATTACHMENTS = 10;

const safeName = (name: string): string =>
  name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'file';

export async function copyFilesToSandbox(
  thread: Thread,
  message: Message
): Promise<Message> {
  if (message.attachments.length === 0) {
    return message;
  }

  const requestContext = new RequestContext();
  requestContext.set('channel', { threadId: thread.id });

  const sandbox = await workspace.resolveSandbox({ requestContext });
  if (!(sandbox instanceof E2BSandbox)) {
    return message;
  }
  await sandbox.start();

  const copied: string[] = [];

  for (const [i, att] of message.attachments
    .slice(0, MAX_ATTACHMENTS)
    .entries()) {
    try {
      const raw = att.fetchData ? await att.fetchData() : att.data;
      if (!raw) {
        continue;
      }
      const content = raw instanceof Blob ? raw : new Uint8Array(raw).buffer;
      const name = safeName(att.name ?? `file-${i + 1}`);
      const path = p('attachments', safeName(message.id), name);
      await sandbox.e2b.files.write(path, content);
      copied.push(
        `- ${name}${att.mimeType ? ` (${att.mimeType})` : ''}: ${path}`
      );
    } catch (error) {
      logger.warn('[chat] failed to copy attachment into sandbox', {
        messageId: message.id,
        error: String(error),
      });
    }
  }
  if (copied.length === 0) {
    return message;
  }

  const truncated =
    message.attachments.length > MAX_ATTACHMENTS
      ? `(showing the first ${MAX_ATTACHMENTS} of ${message.attachments.length} attachments)`
      : undefined;

  const text = [
    message.text,
    'Attached files are downloaded into the sandbox:',
    ...copied,
    truncated,
    'Use these local paths to read, edit, or process them.',
  ]
    .filter(Boolean)
    .join('\n\n');
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
