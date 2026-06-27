// 'slack:C123', 'slack:C123:ts', or 'C123' → 'C123' (raw Slack id, for the WebClient).
export function rawId(id: string): string {
  return id.replace(/^slack:/, '').split(':')[0] ?? id;
}

// Any channel id → Chat SDK form 'slack:C123' (for adapter fetch methods).
export function chatChannelId(id: string): string {
  return `slack:${rawId(id)}`;
}
