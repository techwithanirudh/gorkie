export function withAttribution({
  message,
  userId,
  skipAttribution,
}: {
  message: string;
  userId: string | undefined;
  skipAttribution: boolean;
}): string {
  if (!userId || skipAttribution) {
    return message;
  }
  const footer = `_sent on behalf of <@${userId}>_`;
  return message ? `${message}\n\n${footer}` : footer;
}
