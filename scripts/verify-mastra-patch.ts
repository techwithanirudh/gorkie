import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const dist = join(root, 'node_modules/@mastra/core/dist');

// TODO(slopradar): review: correctness | the list mixes one stock contract (`"__mastra_chat_channel_render"`, which processors/tool-display.ts depends on, not a patch hunk) with patch markers, and two core patch hunks have no marker at all (`stepIsContinued` in the plan-close path and the `channelRequesterId` persisted with suspended tool calls), so losing either passes the check | add 'stepIsContinued' and 'channelRequesterId', and split the stock contract into its own labelled list
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
  // TODO(slopradar): review: error path | the content-hashed bundle names throw a raw ENOENT from readFileSync after any @mastra/core bump instead of saying the patch detached | check existsSync first and report 'patched bundle not found, rebuild the patch for the new version'
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
