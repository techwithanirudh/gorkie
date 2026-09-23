const slackStatusMaxLength = 50;

export function fit({
  content,
  prefix,
  suffix,
}: {
  content: string;
  prefix: string;
  suffix: string;
}): string {
  const budget = slackStatusMaxLength - prefix.length - suffix.length;
  const flat = content.replace(/\s+/g, ' ').trim();
  const clipped = flat.length > budget ? flat.slice(0, budget) : flat;
  return prefix + clipped + suffix;
}

export function truncate(text: string): string {
  return text.length > slackStatusMaxLength
    ? text.slice(0, slackStatusMaxLength)
    : text;
}

export function fileName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}
