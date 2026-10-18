import { z } from 'zod';

export const slackMessageSchema = z.strictObject({
  id: z.string(),
  threadId: z.string().optional(),
  text: z.string(),
  author: z.strictObject({
    userId: z.string(),
    userName: z.string().optional(),
    fullName: z.string().optional(),
    isBot: z.union([z.boolean(), z.literal('unknown')]),
    isMe: z.boolean(),
  }),
  dateSent: z.string(),
  edited: z.boolean(),
  isMention: z.boolean().optional(),
  attachments: z.array(
    z.strictObject({
      type: z.string(),
      name: z.string().optional(),
      mimeType: z.string().optional(),
      url: z.string().optional(),
    })
  ),
});
