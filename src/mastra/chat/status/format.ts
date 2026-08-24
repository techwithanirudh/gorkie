export type Args = Record<string, unknown>;

export function fit(
  prefix: string,
  content: string,
  suffix: string,
  max = 50
): string {
  const budget = max - prefix.length - suffix.length;
  const flat = content.replace(/\s+/g, ' ').trim();
  const clipped = flat.length > budget ? flat.slice(0, budget) : flat;
  return prefix + clipped + suffix;
}

export function truncate(text: string, max = 50): string {
  return text.length > max ? text.slice(0, max) : text;
}

export function str(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function fileName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}
