import { z } from 'zod';
import {
  cardSchema,
  chartSchema,
  imageSchema,
  tableSchema,
} from './rich-blocks';

export const activitySchema = z.object({ status: z.string() });

const activityOutcomeSchema = z.enum([
  'Completed',
  'Waiting',
  'Failed',
  'Stopped',
  'Handed off',
]);

export const activityEndSchema = z.object({
  type: z.literal('activity_end'),
  outcome: activityOutcomeSchema,
});

export type ActivityOutcome = z.infer<typeof activityOutcomeSchema>;

export const delegationActivitySchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
});

export const workDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .describe(
    'A short action for the user, such as "comparing benchmark results" or "installing project dependencies". Describe the purpose, not the tool name. Do not include command contents, code, credentials or tokens.'
  );

export const activityInputSchema = z.object({
  query: z.string().optional(),
  userId: z.string().optional(),
  name: z.string().optional(),
  skillName: z.string().optional(),
  messageId: z.string().optional(),
  channelId: z.string().optional(),
  threadId: z.string().optional(),
  cursor: z.string().optional(),
  path: z.string().optional(),
  url: z.url().optional(),
  description: z.string().optional(),
});

export const activityTaskSchema = z.object({
  type: z.literal('task_update'),
  id: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'complete', 'error']),
  details: z.string().optional(),
  startedAt: z.number().optional(),
});

export const activityPlanSchema = z.object({
  type: z.literal('plan_update'),
  title: z.string(),
  startedAt: z.number().optional(),
});

export const activityPlanMarkerSchema = z.object({
  gorkieActivity: z.literal(true),
});

export type ActivityTask = z.infer<typeof activityTaskSchema>;

export const replyInputSchema = z.strictObject({
  message: z.string().trim().min(1),
  charts: z
    .array(chartSchema)
    .max(2)
    .optional()
    .describe(
      'Native Slack charts shown below the message. Use one for a comparison or a trend over a few categories, and still state the takeaway in the message.'
    ),
  tables: z
    .array(tableSchema)
    .max(2)
    .optional()
    .describe(
      'Sortable, paged Slack tables shown below the message. Use one for data with several columns or more than a handful of rows, instead of a markdown table.'
    ),
  images: z
    .array(imageSchema)
    .max(6)
    .optional()
    .describe(
      'Images shown below the message, from public URLs. Use when the reply is about the picture. For a file in the sandbox, use upload_file instead.'
    ),
  cards: z
    .array(cardSchema)
    .max(10)
    .optional()
    .describe(
      'Link cards shown below the message, for a few options or results to pick from. One shows alone, and more scroll in a carousel. Not for plain answers.'
    ),
});

const replyExtrasSchema = replyInputSchema.pick({
  cards: true,
  charts: true,
  images: true,
  tables: true,
});

export type ReplyExtras = z.infer<typeof replyExtrasSchema>;

export const replyExtrasMetadataSchema = z.looseObject({
  gorkieReplyExtras: replyExtrasSchema,
});
