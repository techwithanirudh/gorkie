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
    ADMIN_USER_IDS: z.string().optional(),

    HACKCLUB_API_KEY: z.string().min(1),
    OPENCODE_API_KEY: z.string().min(1),

    DATABASE_URL: z.url(),

    MASTRA_PLATFORM_ACCESS_TOKEN: z.string().min(1),
    MASTRA_PROJECT_ID: z.string().min(1),

    E2B_API_KEY: z.string().min(1),

    EXA_API_KEY: z.string().min(1),

    AGENTMAIL_API_KEY: z.string().min(1).optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
    EMOJI_PROXY_TOKEN: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
