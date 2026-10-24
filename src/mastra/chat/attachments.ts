import type { Attachment, Message } from 'chat';
import { slackFileId } from '../lib/ids';
import { formatBytes } from '../lib/media';
import { turnContext } from '../prompts/turn-context';
import { setMessageText } from './message';

// Channels' default inlineMedia list (DEFAULT_INLINE_MEDIA_TYPES in
// @mastra/core, not exported). Those files already reach the model as file
// parts.
const inlinedTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

// Chat SDK attachments carry no Slack file id, but url_private embeds it.
export function attachmentLabel({
  attachment,
  index,
}: {
  attachment: Attachment;
  index: number;
}): string {
  const id = attachment.url ? slackFileId(attachment.url) : undefined;
  return [
    attachment.name ?? `file-${index + 1}`,
    id ? `file id ${id}` : attachment.url,
  ]
    .filter(Boolean)
    .join(' ');
}

export function appendAttachments(message: Message): void {
  if (message.attachments.length === 0) {
    return;
  }

  const text = [
    message.text,
    turnContext.attachments,
    ...message.attachments.map((attachment, index) => {
      const size = attachment.size ? formatBytes(attachment.size) : undefined;
      const mimeType =
        attachment.mimeType ||
        // Channels inlines an untyped image as image/png the same way.
        (attachment.type === 'image' ? 'image/png' : undefined);
      const details = [
        attachmentLabel({ attachment, index }),
        attachment.mimeType,
        size,
        mimeType && inlinedTypes.has(mimeType)
          ? turnContext.attachmentInlined
          : turnContext.attachmentNotDownloaded,
      ].filter(Boolean);
      return `- ${details.join(', ')}`;
    }),
    turnContext.getSlackFile,
  ]
    .filter(Boolean)
    .join('\n\n');
  setMessageText({ message, text });
}
