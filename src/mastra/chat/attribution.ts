export function attributionFooter(userId: string): string {
  return `_sent on behalf of <@${userId}>_`;
}

/** Only credit the requester when posting somewhere other than the current thread. */
export function withAttribution(
  message: string,
  userId: string | undefined,
  isCurrentThread: boolean
): string {
  if (!userId || isCurrentThread) {
    return message;
  }
  const footer = attributionFooter(userId);
  return message ? `${message}\n\n${footer}` : footer;
}
