import { z } from 'zod';

export const userProfileSchema = z.object({
  displayName: z.string().optional(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  pronouns: z.string().optional(),
  realName: z.string().optional(),
  status: z.string().optional(),
  timezone: z.string().optional(),
  timezoneLabel: z.string().optional(),
  title: z.string().optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

// 'uncached' means the allow-list has not been built yet; the caller decides
// whether to trigger a rebuild.
export type OptInStatus = 'allowed' | 'not-allowed' | 'unknown' | 'uncached';
