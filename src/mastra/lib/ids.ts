// The Chat SDK Slack adapter spells a conversation as `slack:<channel>` and a
// thread as `slack:<channel>:<ts>` (@chat-adapter/slack encodeThreadId).

const PREFIX = 'slack:';
const PERMALINK = /archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/;

interface SlackId {
  channel: string | undefined;
  ts: string | undefined;
}

function timestamp(value: string | undefined): string | undefined {
  if (!value) {
    return;
  }
  const digits = value.replace('.', '');
  return /^\d{16}$/.test(digits)
    ? `${digits.slice(0, 10)}.${digits.slice(10)}`
    : undefined;
}

export function rawId(id: string): string {
  const bare = id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id;
  return bare.split(':')[0] || id;
}

export function chatChannelId(id: string): string {
  return `${PREFIX}${rawId(id)}`;
}

export function threadIdOf({ channel, ts }: SlackId): string | undefined {
  return channel && ts ? `${PREFIX}${rawId(channel)}:${ts}` : undefined;
}

export function parseSlackId(
  input: string | undefined,
  fallback?: { channel?: string }
): SlackId {
  const channel = fallback?.channel ? rawId(fallback.channel) : undefined;
  if (!input) {
    return { channel, ts: undefined };
  }

  const permalink = PERMALINK.exec(input);
  if (permalink?.[1]) {
    return { channel: permalink[1], ts: `${permalink[2]}.${permalink[3]}` };
  }

  if (input.startsWith(PREFIX)) {
    const [encoded, ts] = input.slice(PREFIX.length).split(':');
    return { channel: encoded || channel, ts: timestamp(ts) };
  }

  return { channel, ts: timestamp(input) };
}
