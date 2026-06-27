const tokens = new Map<string, string>();

export function extractActionToken(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    action_token?: unknown;
    assistant_thread?: { action_token?: unknown };
  };
  const token = r.action_token ?? r.assistant_thread?.action_token;
  return typeof token === 'string' ? token : undefined;
}

export function captureSearchToken(threadId: string, raw: unknown): void {
  const token = extractActionToken(raw);
  if (token) tokens.set(threadId, token);
}

export function getSearchToken(threadId: string): string | undefined {
  return tokens.get(threadId);
}
