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

    DEEPGRAM_API_KEY: z.string().min(1).optional(),
    HUDDLE_WORKSPACE_URL: z.url().optional(),
    HUDDLE_XOXC: z.string().startsWith('xoxc-').optional(),
    HUDDLE_XOXD: z.string().startsWith('xoxd-').optional(),
    HUDDLE_MEDIA_REGION: z.string().default('us-east-1'),

    AGENTMAIL_API_KEY: z.string().min(1).optional(),
    EMOJI_PROXY_TOKEN: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  createFinalSchema: (shape) =>
    z.object(shape).refine(
      (vars) => {
        const huddle = [
          vars.DEEPGRAM_API_KEY,
          vars.HUDDLE_WORKSPACE_URL,
          vars.HUDDLE_XOXC,
          vars.HUDDLE_XOXD,
        ];
        return huddle.every(Boolean) || !huddle.some(Boolean);
      },
      {
        message:
          'Huddle voice needs DEEPGRAM_API_KEY, HUDDLE_WORKSPACE_URL, HUDDLE_XOXC and HUDDLE_XOXD together: set all four or none.',
      }
    ),
});
