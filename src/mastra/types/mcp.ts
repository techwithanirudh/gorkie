import { z } from 'zod';

export const mcpServerSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Letters, numbers, dashes, and underscores only.'
    ),
  url: z.url(),
  token: z.string().min(1).max(2000).optional(),
});

export type MCPServerConfig = z.infer<typeof mcpServerSchema>;
