import { z } from 'zod';

const slackErrorSchema = z.looseObject({
  data: z.looseObject({ error: z.string().optional() }).optional(),
});

export function slackError(error: unknown): string | undefined {
  return slackErrorSchema.safeParse(error).data?.data?.error;
}
