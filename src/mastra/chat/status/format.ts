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
  return prefix + content.replace(/\s+/g, ' ').trim().slice(0, budget) + suffix;
}

export function truncate(text: string): string {
  return text.slice(0, slackStatusMaxLength);
}

export function fileName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}
