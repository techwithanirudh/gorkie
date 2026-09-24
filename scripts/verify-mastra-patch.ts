import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const dist = join(root, 'node_modules/@mastra/core/dist');

const markers = [
  'approvalRequesterId',
  'stashed?.requesterId ?? persistedRequesterId',
  'channelRequesterId',
  'advanceFallbackModel',
  'droppedTaskIds',
  'shown?.summary',
  'stepIsContinued',
];

// Not a patch hunk: stock code that processors/tool-display.ts depends on.
const stockContracts = ['"__mastra_chat_channel_render"'];

// The live view reaches a restricted E2B sandbox only with its traffic token,
// which the browser-viewer patch forwards to connectOverCDP.
const viewerDist = join(root, 'node_modules/@mastra/browser-viewer/dist');

// Native streaming depends on the adapter patch that continues a reply in a
// new message when Slack reports the streamed one as message_not_found.
const slackDist = join(root, 'node_modules/@chat-adapter/slack/dist/index.js');

const missing = [
  ...['agent-DwtTO5Px.js', 'agent-DVnXHd4C.cjs'].flatMap((file) => {
    const path = join(dist, file);
    // The bundle names are content hashes, so any @mastra/core bump renames them.
    if (!existsSync(path)) {
      return [
        `${file}: patched bundle not found, rebuild the patch for the new @mastra/core version`,
      ];
    }
    const source = readFileSync(path, 'utf8');
    return [
      ...markers
        .filter((marker) => !source.includes(marker))
        .map((marker) => `${file}: ${marker}`),
      ...stockContracts
        .filter((contract) => !source.includes(contract))
        .map((contract) => `${file}: stock contract ${contract}`),
    ];
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
