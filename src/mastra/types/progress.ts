import { z } from 'zod';

export const activitySchema = z.object({ status: z.string() });

export const activityOutcomeSchema = z.enum([
  'Completed',
  'Waiting',
  'Failed',
  'Stopped',
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
  current: z.boolean().optional(),
});

export const activityPlanSchema = z.object({
  type: z.literal('plan_update'),
  title: z.string(),
  startedAt: z.number().optional(),
});

export const activityAnswerSchema = z.object({
  gorkieActivity: z.object({ answer: z.string() }),
});

export type ActivityTask = z.infer<typeof activityTaskSchema>;

export const replyInputSchema = z.strictObject({
  message: z.string().trim().min(1),
});
