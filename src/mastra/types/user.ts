import { z } from 'zod';

export const slackUserIdSchema = z.string().regex(/^[UW][A-Z0-9]+$/);

export const slackChannelIdSchema = z
  .string()
  .regex(/^[CG][A-Z0-9]+$/, 'must be a Slack channel id');
