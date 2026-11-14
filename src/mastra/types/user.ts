import { z } from 'zod';

export const slackUserIdSchema = z.string().regex(/^[UW][A-Z0-9]+$/);

export interface UserProfile {
  displayName?: string;
  email?: string;
  fields: { label: string; value: string }[];
  pronouns?: string;
  realName?: string;
  status?: string;
  timezone?: string;
  timezoneLabel?: string;
  title?: string;
}
