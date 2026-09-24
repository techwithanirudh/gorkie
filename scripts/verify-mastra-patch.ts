import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const dist = join(root, 'node_modules/@mastra/core/dist');

// Markers each patch hunk leaves behind, plus the internal render key the
// tool-display processor writes to. A Mastra bump that moves any of these
// must fail the build rather than silently drop a guard.
const markers = [
  'approvalRequesterId',
  'advanceFallbackModel',
  'droppedTaskIds',
  'shown?.summary',
  '"__mastra_chat_channel_render"',
];

const missing = ['agent-DwtTO5Px.js', 'agent-DVnXHd4C.cjs'].flatMap((file) => {
  const source = readFileSync(join(dist, file), 'utf8');
  return markers
    .filter((marker) => !source.includes(marker))
    .map((marker) => `${file}: ${marker}`);
});

if (missing.length > 0) {
  console.error(`[verify-mastra-patch] missing:\n${missing.join('\n')}`);
  process.exit(1);
}
console.log('[verify-mastra-patch] all patch markers present.');
