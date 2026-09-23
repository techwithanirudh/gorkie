import 'dotenv/config';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    MASTRA_PROJECT_ROOT: z.string().default(process.cwd()),

    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_APP_TOKEN: z.string().min(1),
    SLACK_USER_TOKEN: z.string().min(1),
    OPT_IN_CHANNEL: z.string().optional(),

    HACKCLUB_API_KEY: z.string().min(1),
    OPENCODE_API_KEY: z.string().min(1),

    DATABASE_URL: z.url(),

    LANGFUSE_BASE_URL: z.string().default('https://cloud.langfuse.com'),
    LANGFUSE_PUBLIC_KEY: z.string().min(1),
    LANGFUSE_SECRET_KEY: z.string().min(1),

    E2B_API_KEY: z.string().min(1),

    CREDENTIALS_KEY: z
      .base64()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message:
          'CREDENTIALS_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32',
      }),

    GITHUB_APP_SLUG: z.string().min(1),
    GITHUB_APP_CLIENT_ID: z.string().min(1),
    GITHUB_APP_CLIENT_SECRET: z.string().min(1),

    EXA_API_KEY: z.string().min(1),

    AGENTMAIL_API_KEY: z.string().min(1).optional(),
    EMOJI_PROXY_TOKEN: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
