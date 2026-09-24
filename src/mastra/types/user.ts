import { z } from 'zod';

export const slackUserIdSchema = z.string().regex(/^[UW][A-Z0-9]+$/);
