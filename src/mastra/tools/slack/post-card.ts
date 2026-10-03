import { createTool } from '@mastra/core/tools';
import {
  Actions,
  Card,
  CardText,
  Chat,
  Field,
  Fields,
  Image,
  LinkButton,
} from 'chat';
import { z } from 'zod';
import { channelContext } from '../../lib/context';

// Slack Block Kit caps: header 150 chars, section text 3000, field text 2000,
// button text 75, URLs 3000, 10 fields per section. The card renders at most
// six blocks, far under the 50 block message limit.
const httpsUrl = z.url({ protocol: /^https$/ }).max(3000);

export const postCardTool = createTool({
  id: 'post_card',
  description: `Post a Block Kit card into the current conversation: a title, an optional body, label and value fields, an image, link buttons, and a footer line.

Use it when the answer is a structured summary that reads better laid out than as prose: a status report, a comparison of a few items with the same attributes, a release or incident summary, a set of links to act on. Never use it for plain chat, short answers, or anything a sentence or two covers, and never to post somewhere else (use post_message for that). Keep any streamed text around it short instead of repeating the card.`,
  inputSchema: z.strictObject({
    title: z.string().min(1).max(150).describe('Plain text header.'),
    text: z
      .string()
      .min(1)
      .max(3000)
      .optional()
      .describe(
        'Body in Slack mrkdwn: *bold*, _italic_, `code`, <https://example.com|label>, <@U0123ABCD>.'
      ),
    fields: z
      .array(
        z.strictObject({
          label: z.string().min(1).max(100),
          value: z.string().min(1).max(1800).describe('Slack mrkdwn.'),
        })
      )
      .min(1)
      .max(10)
      .optional()
      .describe('Short label and value pairs shown in two columns.'),
    image: z
      .strictObject({
        url: httpsUrl.describe('Publicly reachable image URL.'),
        alt: z.string().min(1).max(2000),
      })
      .optional(),
    links: z
      .array(
        z.strictObject({
          label: z.string().min(1).max(75),
          url: httpsUrl,
        })
      )
      .min(1)
      .max(5)
      .optional()
      .describe('Rendered as buttons that open the URL.'),
    footer: z
      .string()
      .min(1)
      .max(300)
      .optional()
      .describe('Small muted line at the bottom, Slack mrkdwn.'),
  }),
  outputSchema: z.strictObject({ messageId: z.string() }),
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Posted a card: ${input?.title ?? 'untitled'}`,
      }),
    },
  },
  execute: async ({ title, text, fields, image, links, footer }, context) => {
    const { threadId } = channelContext(context.requestContext);
    if (!threadId) {
      throw new Error('No current Slack conversation to post the card in.');
    }
    const card = Card({
      title,
      children: [
        ...(text ? [CardText(text)] : []),
        ...(fields ? [Fields(fields.map((field) => Field(field)))] : []),
        ...(image ? [Image(image)] : []),
        ...(links
          ? [
              // Without an id the adapter derives action_id from the URL, and
              // Slack rejects two buttons that share one.
              Actions(
                links.map(({ label, url }, index) =>
                  LinkButton({ id: `card_link:${index}`, label, url })
                )
              ),
            ]
          : []),
        ...(footer ? [CardText(footer, { style: 'muted' })] : []),
      ],
    });
    const sent = await Chat.getSingleton().thread(threadId).post(card);
    return { messageId: sent.id };
  },
});
