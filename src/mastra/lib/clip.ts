const MAX = 500;

export function clip(value: unknown): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return s.length > MAX ? `${s.slice(0, MAX).trimEnd()}...` : s;
}
