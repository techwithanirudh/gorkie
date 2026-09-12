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
    // Not `MASTRA_PROJECT_ROOT`: the Mastra CLI sets that itself, after our
    // .env is loaded, and points it at `.mastra` rather than the repo root.
    // Anything anchored to it lands in the wrong directory.
    PROJECT_ROOT: z.string().default(process.cwd()),

    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_APP_TOKEN: z.string().min(1),
    OPT_IN_CHANNEL: z.string().optional(),

    HACKCLUB_API_KEY: z.string().min(1),
    OPENCODE_API_KEY: z.string().min(1),

    DATABASE_URL: z.url(),

    LANGFUSE_BASE_URL: z.string().default('https://cloud.langfuse.com'),
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_SECRET_KEY: z.string().optional(),

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
