import type { Message } from 'chat';
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

export function attachments(message: Message): Message {
  if (message.attachments.length === 0) {
    return message;
  }

  const text = [
    message.text,
    'Slack attachments:',
    ...message.attachments.map((attachment, i) => {
      const size = attachment.size
        ? `${Math.ceil(attachment.size / 1024 / 1024)} MB`
        : undefined;
      const mimeType =
        attachment.mimeType ||
        (attachment.type === 'image' ? 'image/png' : undefined);
      const details = [
        attachment.name ?? `file-${i + 1}`,
        attachment.mimeType,
        size,
        // TODO(slopradar): review: correctness | the closing line (L40) tells the model to call get_slack_file with a Slack file id, but this list only gives the url; history.ts L55 extracts the F-id from the url for exactly this | include the file id (share history.ts's extraction) next to or instead of the url
        attachment.url,
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
