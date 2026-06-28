import { RequestContext } from '@mastra/core/request-context';
import type { Attachment, Message, Thread } from 'chat';
import { parseMarkdown } from 'chat';
import { E2BSandbox } from '@mastra/e2b';
import { fetchSlackFile } from '@chat-adapter/slack/api';
import { env } from '../../env';
import { workspace } from '../workspace';
import { logger } from '../logger';

const MAX_SEEDED_ATTACHMENTS = 10;

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') || 'slack-file';
}

function arrayBufferFor(buffer: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  return copy;
}

async function bytesFor(attachment: Attachment): Promise<ArrayBuffer | undefined> {
  if (attachment.fetchData) return arrayBufferFor(await attachment.fetchData());
  if (attachment.data instanceof Blob) return attachment.data.arrayBuffer();
  if (attachment.data instanceof Buffer) return arrayBufferFor(attachment.data);
  if (!attachment.url) return undefined;
  const res = await fetchSlackFile({ token: env.SLACK_BOT_TOKEN, url: attachment.url });
  if (!res.ok) throw new Error(`Slack file download failed with ${res.status}`);
  return res.arrayBuffer();
}

export async function copySlackFilesIntoSandbox(
  thread: Thread,
  message: Message,
): Promise<Message> {
  const attachments = message.attachments.filter(
    (attachment) => attachment.fetchData || attachment.data || attachment.url,
  );
  if (attachments.length === 0) return message;

  const requestContext = new RequestContext();
  requestContext.set('channel', {
    platform: thread.adapter.name,
    isDM: thread.isDM,
    threadId: thread.id,
    channelId: thread.channelId,
    userId: message.author.userId,
    userName: message.author.userName,
  });

  const sandbox = await workspace.resolveSandbox({ requestContext });
  if (!(sandbox instanceof E2BSandbox)) return message;
  await sandbox.start();

  const copied: string[] = [];
  for (const [index, attachment] of attachments.slice(0, MAX_SEEDED_ATTACHMENTS).entries()) {
    try {
      const data = await bytesFor(attachment);
      if (!data) continue;
      const name = safeName(attachment.name ?? attachment.url?.split('/').pop() ?? `file-${index + 1}`);
      const path = `attachments/${safeName(message.id)}/${String(index + 1).padStart(2, '0')}-${name}`;
      await sandbox.e2b.files.write(path, data);
      copied.push(
        `- ${name}: ${path}${attachment.mimeType ? ` (${attachment.mimeType})` : ''}`,
      );
    } catch (error) {
      logger.warn('[chat] failed to copy Slack attachment into sandbox', {
        messageId: message.id,
        name: attachment.name,
        error: String(error),
      });
    }
  }

  if (copied.length === 0) return message;

  const text = [
    message.text,
    'Slack files copied into the sandbox:',
    ...copied,
    'Use these local paths directly for reading or processing.',
  ]
    .filter(Boolean)
    .join('\n\n');
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
