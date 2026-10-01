import { slack } from '../chat/client';

function timestamp(value: string | undefined): string | undefined {
  const digits = value?.replace('.', '');
  return digits && /^\d{16}$/.test(digits)
    ? `${digits.slice(0, 10)}.${digits.slice(10)}`
    : undefined;
}

export function parseSlackInput(input: string | undefined): {
  channel?: string;
  threadTs?: string;
} {
  if (!input) {
    return {};
  }
  const permalink = /archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/.exec(input);
  if (permalink?.[1]) {
    return {
      channel: permalink[1],
      threadTs: `${permalink[2]}.${permalink[3]}`,
    };
  }
  if (input.startsWith(`${slack.name}:`)) {
    const { channel, threadTs } = slack.decodeThreadId(input);
    return { channel: channel || undefined, threadTs: timestamp(threadTs) };
  }
  const threadTs = timestamp(input);
  return threadTs ? { threadTs } : { channel: input };
}
