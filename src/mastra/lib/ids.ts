export function rawId(id: string): string {
  return id.replace(/^slack:/, '').split(':')[0] ?? id;
}

export function chatChannelId(id: string): string {
  return `slack:${rawId(id)}`;
}
