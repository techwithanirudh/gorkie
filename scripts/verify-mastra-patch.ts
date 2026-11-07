import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const dist = join(root, 'node_modules/@mastra/core/dist');

const markers = [
  'pendingActivity',
  'await toolDisplayFn.activity({ stream: iterable, thread: chatThread, adapter })',
  'const completeActivity = () =>',
  'gorkieActivity',
  'type: "activity_end"',
  'render.abortActivity = async () =>',
  'get(CHAT_CHANNEL_RENDER_CONTEXT_KEY)?.abortActivity?.()',
  'gorkieDelegation: { toolCallId, toolName:',
  'transient activity cleanup failed',
  'typingGate.transientActivity',
  'advanceFallbackModel',
  'rolloverPlan',
  'carriedPlanTitle',
  'title: "Completed"',
  'groupedTask && !planTitleRef.current',
  'rendersToolsInPlan || toolDisplayFn',
  'stepIsContinued',
  'id: "continued"',
  '-(input|output)-processor$/.test(workflowId)',
  '(!requesterId || requesterId !== actorId)',
  'buildRenderContextForThread(threadId, requestContext?.get("channel")?.userId)',
  '"__mastra_chat_channel_render"',
];

// The deployer's server is bundled into the build output, so the output has
// no @mastra/deployer install and the marker is checked in the bundle instead.
const deployerServer = [
  join(root, 'node_modules/@mastra/deployer/dist/server/index.js'),
  join(root, 'index.mjs'),
].find((path) => existsSync(path));

const missing = [
  ...['agent-BP9OWM6D.js', 'agent-3djrMSaa.cjs'].flatMap((file) => {
    const path = join(dist, file);
    if (!existsSync(path)) {
      return [
        `${file}: patched bundle not found, rebuild the patch for the new @mastra/core version`,
      ];
    }
    const source = readFileSync(path, 'utf8');
    return markers
      .filter((marker) => !source.includes(marker))
      .map((marker) => `${file}: ${marker}`);
  }),
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
