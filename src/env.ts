import 'dotenv/config';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_APP_TOKEN: z.string().min(1),
    OPT_IN_CHANNEL: z.string().optional(),

    HACKCLUB_API_KEY: z.string().min(1),

    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),

    OPENCODE_API_KEY: z.string().min(1).optional(),

    DATABASE_URL: z.url(),

    E2B_API_KEY: z.string().min(1),

    EXA_API_KEY: z.string().min(1),

    AGENTMAIL_API_KEY: z.string().min(1).optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),

    LANGFUSE_PUBLIC_KEY: z.string().min(1),
    LANGFUSE_SECRET_KEY: z.string().min(1),
    LANGFUSE_BASEURL: z.url().default('https://cloud.langfuse.com'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
