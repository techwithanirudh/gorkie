import { z } from 'zod';

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

// json-render resolves `$` objects such as $template when it renders, so their
// result would skip the broadcast filter that runs on the spec.
function hasExpression(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasExpression);
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.entries(value).some(
    ([key, entry]) => key.startsWith('$') || hasExpression(entry)
  );
}

const cardSpecSchema = z.strictObject({
  root: z.string().describe('Id of the Card element in elements.'),
  elements: z.record(
    z.string(),
    z.strictObject({
      type: z.string(),
      props: z
        .record(z.string(), z.unknown())
        .refine((props) => !hasExpression(props), {
          error: 'Props are literal values: no $ expressions.',
        }),
      children: z.array(z.string()).optional(),
    })
  ),
});

export type CardSpec = z.infer<typeof cardSpecSchema>;

export const partialReplySchema = z.looseObject({
  message: z.string().optional(),
  card: cardSpecSchema.optional().catch(undefined),
});

export const replyInputSchema = z.strictObject({
  message: z.string().trim().min(1),
  card: cardSpecSchema
    .optional()
    .describe(
      'Rich content shown right after message in the same Slack message, as a flat map of elements in display order, so a Text between two charts sits between them. One Card is the root. Components: Card {title?, subtitle?, imageUrl?} and Section {} hold children, Text {content, style?: plain|bold|muted}, Fields {} holds Field {label, value}, Table {headers, rows, caption, align?}, Chart {title, chart: {type: pie, segments: [{label, value}]} or {type: bar|line|area, categories, series: [{name, values}], xLabel?, yLabel?}}, Image {url, alt}, Divider {}, Actions {} holds LinkButton {label, url} and Button {label, style?: primary|danger|default}. Clicking a Button sends you its label as a follow-up message from that person, so write the label as that request and use one for a next step you can act on. At most 2 Chart and 1 Table. Chart title and labels: 50 and 20 characters.'
    ),
});
