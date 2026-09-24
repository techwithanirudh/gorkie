export function sh(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
