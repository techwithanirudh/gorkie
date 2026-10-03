import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const dist = join(root, 'node_modules/@mastra/core/dist');

const markers = [
  'approvalRequesterId',
  'stashed?.requesterId ?? persistedRequesterId',
  'channelRequesterId',
  'advanceFallbackModel',
  'rolloverPlan',
  'groupedTask && !planTitleRef.current',
  'rendersToolsInPlan || toolDisplayFn',
  'stepIsContinued',
  'id: "continued"',
];

const stockContracts = ['"__mastra_chat_channel_render"'];

// Native streaming depends on the adapter patch that continues a reply in a
// new message when Slack reports the streamed one as message_not_found.
const slackDist = join(root, 'node_modules/@chat-adapter/slack/dist/index.js');

// The deployer's server is bundled into the build output, so the output has
// no @mastra/deployer install and the marker is checked in the bundle instead.
const deployerServer = [
  join(root, 'node_modules/@mastra/deployer/dist/server/index.js'),
  join(root, 'index.mjs'),
].find((path) => existsSync(path));

const missing = [
  ...['agent-DwtTO5Px.js', 'agent-DVnXHd4C.cjs'].flatMap((file) => {
    const path = join(dist, file);
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
  ...(existsSync(slackDist) ? [] : ['@chat-adapter/slack index.js: not found']),
  ...(existsSync(slackDist)
    ? ['STREAM_GONE_ERROR', 'STREAM_SEGMENT_MAX_CHARS']
        .filter((marker) => !readFileSync(slackDist, 'utf8').includes(marker))
        .map((marker) => `@chat-adapter/slack index.js: ${marker}`)
    : []),
  ...(deployerServer &&
  readFileSync(deployerServer, 'utf8').includes('preContextIsPublic')
    ? []
    : ['@mastra/deployer server: preContextIsPublic']),
];

if (missing.length > 0) {
  console.error(`[verify-mastra-patch] missing:\n${missing.join('\n')}`);
  process.exit(1);
}
console.log('[verify-mastra-patch] all patch markers present.');
