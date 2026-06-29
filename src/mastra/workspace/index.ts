import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  LocalSkillSource,
  WORKSPACE_TOOLS,
  Workspace,
} from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';
import { channelContext } from '../lib/context';

export const workspace = new Workspace({
  id: 'gorkie-workspace',
  name: 'gorkie',
  sandbox: ({ requestContext }) => {
    const threadId = channelContext(requestContext).threadId;
    if (!threadId) {
      throw new Error('No thread id available for sandbox.');
    }
    return new E2BSandbox({
      id: `gorkie-${createHash('sha256').update(threadId).digest('hex').slice(0, 32)}`,
      apiKey: env.E2B_API_KEY,
      template: config.template,
      metadata: { 'thread-id': threadId },
      instructions: [
        'You have a persistent E2B Linux sandbox (Debian, Node.js 24, Python 3) for this conversation, driven by `execute_command`.',
        'Pre-installed: agent-browser (browser automation: run `agent-browser skills get core` for usage), agentmail (Python), wrangler (Cloudflare Workers), ripgrep, fd, ffmpeg, imagemagick, jq, pillow/matplotlib/numpy/pandas.',
        'You have no Cloudflare account or auth, so never run `wrangler login`/`wrangler whoami`. To deploy, use the account-less temporary deploy (`wrangler deploy --temporary`), which returns a live `*.workers.dev` URL plus a claim link, and share both.',
        'Read, write, and edit files with shell commands (`cat`, `tee`, `sed`); install anything else before first use (`apt-get`, `pip3`, `npm`).',
        'Verify your work by running it before claiming it works; read stderr and fix failures instead of re-running the same failing command.',
        'The sandbox persists across turns in this thread, so files and installed tools you create stay available. Files are not visible in chat unless you post them back.',
      ].join(' '),
      timeout: config.timeout,
    });
  },
  sandboxCacheKey: ({ requestContext }) =>
    channelContext(requestContext).threadId,
  skillSource: new LocalSkillSource({
    basePath: resolve(process.cwd(), 'workspace'),
  }),
  skills: ['skills'],
  tools: {
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: 'execute_command' },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: 'get_process_output',
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: 'kill_process' },
  },
});
