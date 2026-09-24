import type { Attachment, Message } from 'chat';
import { parseMarkdown } from 'chat';

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
  const id = attachment.url?.match(/\bF[A-Z0-9]{6,}\b/)?.[0];
  return [
    attachment.name ?? `file-${index + 1}`,
    id ? `file id ${id}` : attachment.url,
  ]
    .filter(Boolean)
    .join(' ');
}

export function attachments(message: Message): Message {
  if (message.attachments.length === 0) {
    return message;
  }

  const text = [
    message.text,
    'Slack attachments:',
    ...message.attachments.map((attachment, index) => {
      const size = attachment.size
        ? `${Math.ceil(attachment.size / 1024 / 1024)} MB`
        : undefined;
      const mimeType =
        attachment.mimeType ||
        (attachment.type === 'image' ? 'image/png' : undefined);
      const details = [
        attachmentLabel({ attachment, index }),
        attachment.mimeType,
        size,
        mimeType && inlinedTypes.has(mimeType)
          ? 'attached to this message, so you can already see it'
          : 'not downloaded',
      ].filter(Boolean);
      return `- ${details.join(', ')}`;
    }),
    'Call get_slack_file with a Slack file id to download a file into the workspace, which you only need for an attached file if you want to work on it there.',
  ]
    .filter(Boolean)
    .join('\n\n');
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
