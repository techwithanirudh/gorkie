import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { BrowserViewer } from '@mastra/browser-viewer';
import type {
  KeyboardEventParams,
  MouseEventParams,
} from '@mastra/core/browser';
import type { E2BSandbox } from '@mastra/e2b';
import { z } from 'zod';
import { liveView as config } from '../config';
import { logger } from '../lib/logger';
import type { BrowserSessionHooks } from '../types';

const versionSchema = z.object({ webSocketDebuggerUrl: z.string().min(1) });

// Chrome must never start on the host. BrowserViewer launches a local Chrome
// whenever it has no session for a thread, so every path that would do that is
// overridden here, and this unusable executable makes any path missed fail
// instead of quietly launching one.
const noHostChrome = '/nonexistent/gorkie-never-launches-chrome-on-the-host';

interface SandboxCdp {
  edgeUrl: string;
  headers: Record<string, string>;
  loopbackUrl: string;
}

async function readVersion({
  headers,
  origin,
}: {
  headers: Record<string, string>;
  origin: URL;
}): Promise<string | undefined> {
  // CloakServe is still starting until this answers, so a refused connection
  // or a half-written body only means waitForVersion polls again.
  const response = await fetch(new URL('/json/version', origin), {
    headers,
    signal: AbortSignal.timeout(config.versionProbeTimeoutMs),
  }).catch(() => undefined);
  if (!response?.ok) {
    return;
  }
  const parsed = versionSchema.safeParse(
    await response.json().catch(() => undefined)
  );
  return parsed.data?.webSocketDebuggerUrl;
}

async function waitForVersion({
  deadline,
  headers,
  origin,
}: {
  deadline: number;
  headers: Record<string, string>;
  origin: URL;
}): Promise<string> {
  await sleep(500);
  const webSocketUrl = await readVersion({ headers, origin });
  if (webSocketUrl) {
    return webSocketUrl;
  }
  if (Date.now() >= deadline) {
    throw new Error(
      `CloakBrowser did not become ready on sandbox port ${config.cdpPort}.`
    );
  }
  return waitForVersion({ deadline, headers, origin });
}

async function startCloakServe({
  sandbox,
  threadId,
}: {
  sandbox: E2BSandbox;
  threadId: string;
}): Promise<void> {
  const dir = '/tmp/cloakbrowser';
  // CloakBrowser derives its whole fingerprint from this seed, so one thread
  // keeps one fingerprint across turns.
  const fingerprint = createHash('sha256')
    .update(threadId)
    .digest('hex')
    .slice(0, 16);
  const flags = [
    `--port=${config.cdpPort}`,
    `--data-dir=${dir}/data`,
    '--headless=new',
    '--idle-timeout=0',
    '--window-size=1280,893',
    `--fingerprint=${fingerprint}`,
  ].join(' ');
  await sandbox.e2b.commands.run(
    `mkdir -p ${dir}/data && ${config.cloakServe.path} ${flags} > ${dir}/cloakserve.log 2>&1`,
    { background: true }
  );
}

async function sandboxCdp({
  sandbox,
  threadId,
}: {
  sandbox: E2BSandbox;
  threadId: string;
}): Promise<SandboxCdp | undefined> {
  // allowPublicTraffic can only be set when a sandbox is created, so sandboxes
  // made before the live view carry no token and expose every port publicly.
  // Never open a CDP port on those: agent-browser keeps its own browser there.
  const token = sandbox.e2b.trafficAccessToken;
  if (!token) {
    logger.warn('[live-view] sandbox predates restricted traffic, skipped', {
      threadId,
    });
    return;
  }
  const headers = { 'e2b-traffic-access-token': token };
  const origin = new URL(`https://${sandbox.e2b.getHost(config.cdpPort)}`);
  let webSocketUrl = await readVersion({ headers, origin });
  if (!webSocketUrl) {
    await startCloakServe({ sandbox, threadId });
    webSocketUrl = await waitForVersion({
      deadline: Date.now() + config.startupTimeoutMs,
      headers,
      origin,
    });
  }
  const path = new URL(webSocketUrl).pathname;
  return {
    loopbackUrl: `ws://127.0.0.1:${config.cdpPort}${path}`,
    edgeUrl: `wss://${origin.host}${path}`,
    headers,
  };
}

export class SandboxBrowser extends BrowserViewer {
  private readonly sandboxFor: (threadId: string) => Promise<E2BSandbox>;
  private sessionHooks?: BrowserSessionHooks;
  private readonly loopbackUrls = new Map<string, string>();

  constructor({
    sandboxFor,
  }: {
    sandboxFor: (threadId: string) => Promise<E2BSandbox>;
  }) {
    super({
      cli: 'agent-browser',
      executablePath: noHostChrome,
      headless: true,
      scope: 'thread',
    });
    this.sandboxFor = sandboxFor;
  }

  onSession(hooks: BrowserSessionHooks): void {
    this.sessionHooks = hooks;
  }

  private async connectThread(threadId: string | undefined): Promise<void> {
    if (!threadId || this.isBrowserRunning(threadId)) {
      return;
    }
    const sandbox = await this.sandboxFor(threadId);
    const cdp = await sandbox
      .retryOnDead(async () => {
        await sandbox.ensureRunning();
        return sandboxCdp({ sandbox, threadId });
      })
      .catch((error: unknown) => {
        logger.warn('[live-view] could not reach the sandbox browser', {
          error,
          threadId,
        });
      });
    if (!cdp) {
      return;
    }
    const connected = await this.connectToExternalCdp(cdp.edgeUrl, threadId, {
      headers: cdp.headers,
    }).then(
      () => true,
      (error: unknown) => {
        logger.warn('[live-view] could not attach to the sandbox browser', {
          error,
          threadId,
        });
        return false;
      }
    );
    if (!connected) {
      return;
    }
    this.loopbackUrls.set(threadId, cdp.loopbackUrl);
    if (!this.sessionHooks) {
      return;
    }
    await this.sessionHooks.connected(threadId).catch((error: unknown) => {
      logger.warn('[live-view] failed to post the live view', {
        error,
        threadId,
      });
    });
  }

  // Workspace CLI commands reach the browser through launch(), never
  // super.launch(), which would start Chrome on the host.
  override async launch(threadId?: string): Promise<void> {
    await this.connectThread(threadId ?? this.getCurrentThread());
  }

  override async ensureReady(): Promise<void> {
    await this.connectThread(this.getCurrentThread());
  }

  // The session's own CDP URL is the E2B edge address; agent-browser runs in
  // the sandbox and reaches the same Chrome over loopback without the token.
  override getCdpUrl(threadId?: string): string | null {
    return this.loopbackUrls.get(threadId ?? this.getCurrentThread()) ?? null;
  }

  override async closeThreadSession(threadId: string): Promise<void> {
    this.loopbackUrls.delete(threadId);
    await super.closeThreadSession(threadId).catch((error: unknown) => {
      logger.debug('[live-view] failed to close the browser session', {
        error,
        threadId,
      });
    });
    await this.sessionHooks?.closed(threadId);
  }

  async screenshot(threadId: string): Promise<Buffer | undefined> {
    const page = await this.getActivePage(threadId);
    return page?.screenshot({ type: 'jpeg', quality: 60 });
  }

  override async getCurrentUrl(threadId?: string): Promise<string | null> {
    const page = await this.getActivePage(threadId ?? this.getCurrentThread());
    return page?.url() ?? null;
  }

  override injectMouseEvent(
    _params: MouseEventParams,
    _threadId?: string
  ): Promise<void> {
    return Promise.resolve();
  }

  override injectKeyboardEvent(
    _params: KeyboardEventParams,
    _threadId?: string
  ): Promise<void> {
    return Promise.resolve();
  }
}
