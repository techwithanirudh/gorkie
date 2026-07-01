import type { Message } from 'chat';
import { parseMarkdown } from 'chat';

export function attachments(message: Message): Message {
  if (message.attachments.length === 0) {
    return message;
  }

  const text = [
    message.text,
    'Slack attachments, not downloaded yet:',
    ...message.attachments.map((attachment, i) => {
      const size = attachment.size
        ? `${Math.ceil(attachment.size / 1024 / 1024)} MB`
        : undefined;
      const details = [
        attachment.name ?? `file-${i + 1}`,
        attachment.mimeType,
        size,
        attachment.url ?? attachment.fetchMetadata?.url,
      ].filter(Boolean);
      return `- ${details.join(', ')}`;
    }),
    'Call get_file with a Slack URL or file id to download it into the workspace.',
  ]
    .filter(Boolean)
    .join('\n\n');
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
