import 'dotenv/config';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().positive().default(4111),
    PUBLIC_BASE_URL: z.url().optional(),
    GORKIE_API_TOKEN: z.string().min(32).optional(),

    // Set in .env to the repo root. Not MASTRA_PROJECT_ROOT: `mastra dev` sets
    // that after .env loads and points it at `.mastra`, so migrations and the
    // DuckDB file anchored to it land in the wrong directory.
    PROJECT_ROOT: z.string().default(process.cwd()),

    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),
    SLACK_USER_TOKEN: z.string().min(1),
    OPT_IN_CHANNEL: z.string().optional(),
    LOGS_CHANNEL: z
      .string()
      .regex(/^[CG][A-Z0-9]+$/, 'must be a Slack channel id')
      .optional(),
    MODERATORS: z
      .string()
      .optional()
      .transform(
        (value) =>
          value
            ?.split(',')
            .map((id) => id.trim())
            .filter(Boolean) ?? []
      )
      .pipe(z.array(z.string().regex(/^[UW][A-Z0-9]+$/))),

    HACKCLUB_API_KEY: z.string().min(1),
    // TODO(slopradar): review: config single source | validated here but never read as env.OPENCODE_API_KEY: Mastra's model router pulls it from process.env itself (provider-registry.json opencode-go.apiKeyEnvVar), so the rule 'only env.ts reads process.env' holds only by accident | pass it explicitly from providers.ts opencode() as `model: { id: `opencode-go/${modelId}`, apiKey: env.OPENCODE_API_KEY }` (OpenAICompatibleConfig), and teach modelSlug to read `.id`
    OPENCODE_API_KEY: z.string().min(1),

    DATABASE_URL: z.url(),

    // TODO(slopradar): CODING_STANDARDS: validate at boundaries | a URL validated as z.string(), unlike PUBLIC_BASE_URL and DATABASE_URL beside it | z.url().default('https://cloud.langfuse.com')
    LANGFUSE_BASE_URL: z.string().default('https://cloud.langfuse.com'),
    LANGFUSE_PUBLIC_KEY: z.string().min(1),
    LANGFUSE_SECRET_KEY: z.string().min(1),

    E2B_API_KEY: z
      .string()
      .regex(
        /^e2b_[0-9a-f]+$/,
        'must be an E2B API key: "e2b_" followed by hex characters'
      ),

    // TODO(slopradar): simplification: duplicated logic | CREDENTIALS_KEY and CREDENTIALS_KEY_PREVIOUS repeat the same base64 + 32-byte refine | declare `const aesKey = z.base64().refine((v) => Buffer.from(v, 'base64').length === 32, ...)` above createEnv and use it for both (the second with .optional())
    CREDENTIALS_KEY: z
      .base64()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message:
          'CREDENTIALS_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32',
      }),
    CREDENTIALS_KEY_PREVIOUS: z
      .base64()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message:
          'CREDENTIALS_KEY_PREVIOUS must be the old 32-byte base64 CREDENTIALS_KEY',
      })
      .optional(),

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

if (env.NODE_ENV === 'production') {
  if (!env.GORKIE_API_TOKEN) {
    throw new Error('GORKIE_API_TOKEN is required in production.');
  }
  if (env.PUBLIC_BASE_URL && !env.PUBLIC_BASE_URL.startsWith('https://')) {
    throw new Error('PUBLIC_BASE_URL must be https in production.');
  }
}
