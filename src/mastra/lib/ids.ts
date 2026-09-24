interface SlackId {
  channel: string | undefined;
  ts: string | undefined;
}
const PREFIX = 'slack:';

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

export function parseSlackId({
  channel: fallbackChannel,
  input,
}: {
  channel?: string;
  input: string | undefined;
}): SlackId {
  const channel = fallbackChannel ? rawId(fallbackChannel) : undefined;
  if (!input) {
    return { channel, ts: undefined };
  }

  const permalink = /archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/.exec(input);
  if (permalink?.[1]) {
    return { channel: permalink[1], ts: `${permalink[2]}.${permalink[3]}` };
  }

  if (input.startsWith(PREFIX)) {
    const [encoded, ts] = input.slice(PREFIX.length).split(':');
    return { channel: encoded || channel, ts: timestamp(ts) };
  }

  return { channel, ts: timestamp(input) };
}
