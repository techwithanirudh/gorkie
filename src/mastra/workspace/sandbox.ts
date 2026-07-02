import { createHash } from 'node:crypto';
import { E2BSandbox, type E2BSandboxOptions } from '@mastra/e2b';
import type { SandboxNetworkOpts } from 'e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';
import {
  createSandboxEnv,
  createSandboxNetwork,
  installSandboxNetworkPatch,
  withSandboxNetwork,
} from './network';

class GorkieSandbox extends E2BSandbox {
  private readonly network: SandboxNetworkOpts | undefined;

  constructor({
    network,
    ...options
  }: E2BSandboxOptions & { network?: SandboxNetworkOpts }) {
    installSandboxNetworkPatch();
    super(options);
    this.network = network;
  }

  override start(): Promise<void> {
    return withSandboxNetwork(this.network, () => super.start());
  }
}

export function createSandbox(threadId: string): E2BSandbox {
  const network = createSandboxNetwork();
  const networkVersion = createHash('sha256')
    .update(JSON.stringify(network ?? {}))
    .digest('hex')
    .slice(0, 8);

  const id = `gorkie-${createHash('sha256').update(`${threadId}:${networkVersion}`).digest('hex').slice(0, 32)}`;

  const sandbox: E2BSandbox = new GorkieSandbox({
    id,
    apiKey: env.E2B_API_KEY,
    template: config.template,
    network,
    env: createSandboxEnv(),
    metadata: { 'thread-id': threadId },
    instructions: [
      'You have a persistent E2B Linux sandbox (Debian, Node.js 24, Python 3) for this conversation, driven by `execute_command`.',
      'Pre-installed: agent-browser (browser automation: run `agent-browser skills get core` for usage), agentmail (Python), gh (GitHub CLI), wrangler (Cloudflare Workers), ripgrep, fd, ffmpeg, imagemagick, jq, pillow/matplotlib/numpy/pandas, gTTS, SpeechRecognition, and pydub.',
      'AgentMail and GitHub credentials, when configured, are brokered by the host through sandbox network rules. Use the placeholder env values normally; never ask the user to paste tokens.',
      'You have no Cloudflare account or auth, so never run `wrangler login`/`wrangler whoami`. To deploy, use the account-less temporary deploy (`wrangler deploy --temporary`), which returns a live `*.workers.dev` URL plus a claim link, and share both.',
      'Read, write, and edit files with filesystem tools or shell commands; install anything else before first use (`apt-get`, `pip3`, `npm`).',
      'Verify your work by running it before claiming it works; read stderr and fix failures instead of re-running the same failing command.',
      'The sandbox persists across turns in this thread, so files and installed tools you create stay available. Files are not visible in chat unless you post them back.',
    ].join(' '),
    timeout: config.timeout,
  });

  return sandbox;
}
