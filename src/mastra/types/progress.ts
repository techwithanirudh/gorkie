import { z } from 'zod';

export const activitySchema = z.object({ status: z.string() });

const activityOutcomeSchema = z.enum([
  'Completed',
  'Waiting',
  'Failed',
  'Stopped',
  'Skipped',
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
