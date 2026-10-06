import type { RequestContext } from '@mastra/core/request-context';
import type { E2BSandbox } from '@mastra/e2b';
import { slack } from '../../chat/client';
import { emoji, image } from '../../config';
import { viewableImageType } from '../../lib/media';
import { spendSlackCall } from '../../lib/slack-budget';
import { sandboxPath } from '../../workspace';

let cachedList:
  | { entries: Record<string, string>; expiresAt: number }
  | undefined;

export async function downloadEmoji({
  shortcode,
  filename,
  sandbox,
  requestContext,
  signal,
}: {
  shortcode: string;
  filename?: string;
  sandbox: E2BSandbox;
  requestContext: RequestContext;
  signal?: AbortSignal;
}) {
  const [, name] = shortcode.trim().split(':');
  if (!cachedList || cachedList.expiresAt <= Date.now()) {
    spendSlackCall(requestContext);
    const response = await slack.webClient.emoji.list();
    cachedList = {
      entries: response.emoji ?? {},
      expiresAt: Date.now() + emoji.listTtl,
    };
  }
  let current = name;
  const visited = new Set<string>();
  let url: string | undefined;
  while (!visited.has(current)) {
    visited.add(current);
    const entry = cachedList.entries[current];
    if (!entry) {
      throw new Error(
        `:${name}: is not a custom emoji in this workspace. Standard Unicode emoji do not have downloadable Slack files.`
      );
    }
    if (!entry.startsWith('alias:')) {
      url = entry;
      break;
    }
    current = entry.slice('alias:'.length);
  }
  if (!url) {
    throw new Error(`:${name}: has a circular emoji alias.`);
  }
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'emoji.slack-edge.com' ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error(`Refusing to fetch :${name}: outside Slack's emoji CDN.`);
  }
  const response = await fetch(parsed, { redirect: 'error', signal });
  if (!response.ok) {
    throw new Error(`Failed to download :${name}: (${response.status}).`);
  }
  if (Number(response.headers.get('content-length')) > image.maxViewBytes) {
    throw new Error(`:${name}: is too large to download.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > image.maxViewBytes) {
    throw new Error(`:${name}: is too large to download.`);
  }
  const mimeType = viewableImageType(bytes);
  if (!mimeType) {
    throw new Error(
      `:${name}: is not a supported image (png, jpeg, gif, webp).`
    );
  }
  const sanitized = (filename ?? `${name}.${mimeType.split('/')[1]}`).replace(
    /[^\w.-]+/g,
    '_'
  );
  const savedName =
    sanitized === '' || sanitized === '.' || sanitized === '..'
      ? 'slack-emoji'
      : sanitized;
  const path = sandboxPath('downloads', savedName);
  await sandbox.retryOnDead(async () => {
    await sandbox.e2b.files.makeDir(sandboxPath('downloads'));
    await sandbox.e2b.files.write(path, bytes.buffer, { signal });
  });
  return {
    path,
    filename: savedName,
    mimeType,
    size: bytes.byteLength,
  };
}
