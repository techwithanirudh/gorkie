import { z } from 'zod';

const actionToken = z.looseObject({
  action_token: z.string().min(1).optional(),
  assistant_thread: z
    .looseObject({ action_token: z.string().min(1).optional() })
    .optional(),
});

const tokens = new Map<string, string>();

export function extractActionToken(raw: unknown): string | undefined {
  const parsed = actionToken.safeParse(raw);
  return parsed.success
    ? (parsed.data.action_token ?? parsed.data.assistant_thread?.action_token)
    : undefined;
}

export function captureSearchToken(threadId: string, raw: unknown): void {
  const token = extractActionToken(raw);
  if (token) {
    tokens.set(threadId, token);
  }
}

export function getSearchToken(threadId: string): string | undefined {
  return tokens.get(threadId);
}
