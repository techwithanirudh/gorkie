export function parseSlackMessageUrl(url: string) {
  const match = url.match(/archives\/([^/]+)\/p(\d{10})(\d{6})/);
  if (!(match?.[1] && match[2] && match[3])) {
    throw new Error(`Could not parse Slack message URL: ${url}`);
  }
  return { channel: match[1], ts: `${match[2]}.${match[3]}` };
}
