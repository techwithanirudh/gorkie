export function withAttribution(
  message: string,
  userId: string | undefined,
  isCurrentThread: boolean
): string {
  if (!userId || isCurrentThread) {
    return message;
  }
  const footer = `_sent on behalf of <@${userId}>_`;
  return message ? `${message}\n\n${footer}` : footer;
}
