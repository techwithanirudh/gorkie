import type { Message } from 'chat';
import { parseMarkdown } from 'chat';

export function attachments(message: Message): Message {
  if (message.attachments.length === 0) {
    return message;
  }

  const text = [
    message.text,
    'Attached files are available in Slack but have not been downloaded into the sandbox yet:',
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
    'Use get_file with the Slack URL or file id only if you need to inspect the file bytes.',
  ]
    .filter(Boolean)
    .join('\n\n');
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
