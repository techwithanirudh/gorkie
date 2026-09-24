import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const dist = join(root, 'node_modules/@mastra/core/dist');

// Markers each patch hunk leaves behind, plus the internal render key the
// tool-display processor writes to. A Mastra bump that moves any of these
// must fail the build rather than silently drop a guard.
const markers = [
  'approvalRequesterId',
  'stashed?.requesterId ?? persistedRequesterId',
  'advanceFallbackModel',
  'droppedTaskIds',
  'shown?.summary',
  '"__mastra_chat_channel_render"',
];

// The live view reaches a restricted E2B sandbox only with its traffic token,
// which the browser-viewer patch forwards to connectOverCDP.
const viewerDist = join(root, 'node_modules/@mastra/browser-viewer/dist');

// Native streaming depends on the adapter patch that continues a reply in a
// new message when Slack reports the streamed one as message_not_found.
const slackDist = join(root, 'node_modules/@chat-adapter/slack/dist/index.js');

const missing = [
  ...['agent-DwtTO5Px.js', 'agent-DVnXHd4C.cjs'].flatMap((file) => {
    const source = readFileSync(join(dist, file), 'utf8');
    return markers
      .filter((marker) => !source.includes(marker))
      .map((marker) => `${file}: ${marker}`);
  }),
  ...['index.js', 'index.cjs']
    .filter(
      (file) =>
        !readFileSync(join(viewerDist, file), 'utf8').includes(
          'connectOverCDP(cdpUrl, cdpOptions)'
        )
    )
    .map(
      (file) => `browser-viewer ${file}: connectOverCDP(cdpUrl, cdpOptions)`
    ),
  ...(readFileSync(slackDist, 'utf8').includes('STREAM_GONE_ERROR')
    ? []
    : ['@chat-adapter/slack index.js: STREAM_GONE_ERROR']),
];

if (missing.length > 0) {
  console.error(`[verify-mastra-patch] missing:\n${missing.join('\n')}`);
  process.exit(1);
}
console.log('[verify-mastra-patch] all patch markers present.');
