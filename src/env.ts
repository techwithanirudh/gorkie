import 'dotenv/config';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    // Injected by the Mastra CLI, not set by hand. `mastra dev` and
    // `mastra start` each run with a different cwd, neither of which is the
    // repo root, so anything writing a file relative to cwd needs this.
    MASTRA_PROJECT_ROOT: z.string().default(process.cwd()),

    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_APP_TOKEN: z.string().min(1),
    OPT_IN_CHANNEL: z.string().optional(),

    HACKCLUB_API_KEY: z.string().min(1),
    OPENCODE_API_KEY: z.string().min(1),

    DATABASE_URL: z.url(),

    MASTRA_PLATFORM_ACCESS_TOKEN: z.string().min(1),
    MASTRA_PROJECT_ID: z.string().min(1),

    // The production project, used by tooling that reads real traffic.
    // `scripts/traces.ts` prefers these and falls back to the pair above.
    MASTRA_PLATFORM_ACCESS_TOKEN_PROD: z.string().optional(),
    MASTRA_PROJECT_ID_PROD: z.string().optional(),
    MASTRA_ORG_ID: z.string().optional(),

    E2B_API_KEY: z.string().min(1),

    CREDENTIALS_KEY: z.string().min(1),

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
