import { z } from 'zod';

const envSchema = z.object({
  // Slack
  SLACK_BOT_TOKEN: z.string().min(1, 'SLACK_BOT_TOKEN is required'),
  SLACK_APP_TOKEN: z.string().min(1, 'SLACK_APP_TOKEN is required'),

  // Model — Mastra built-in `openrouter` provider (Hack Club proxy by default)
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.url().default('https://ai.hackclub.com/proxy/v1'),

  // Storage — Postgres
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Sandbox — E2B (isolated cloud compute; the bot never runs code on our host)
  E2B_API_KEY: z.string().min(1, 'E2B_API_KEY is required for the E2B sandbox'),

  // Observability — Langfuse (optional; tracing is wired only when keys are present)
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.url().default('https://cloud.langfuse.com'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);

/** True when both Langfuse keys are configured. */
export const langfuseEnabled = Boolean(
  env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY,
);
