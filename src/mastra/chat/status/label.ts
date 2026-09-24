export function label(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words.length === 0
    ? value
    : words
        .map(
          (word) =>
            `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
        )
        .join(' ');
}
