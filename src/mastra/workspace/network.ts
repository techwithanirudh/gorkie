import { AsyncLocalStorage } from 'node:async_hooks';
import { Sandbox, type SandboxNetworkOpts, type SandboxOpts } from 'e2b';
import { env } from '@/env';

const networks = new AsyncLocalStorage<SandboxNetworkOpts | undefined>();
const create = Sandbox.create;
let patched = false;

export function installSandboxNetworkPatch(): void {
  if (patched) {
    return;
  }
  patched = true;

  Object.defineProperty(Sandbox, 'create', {
    value: (
      templateOrOptions?: string | SandboxOpts,
      options?: SandboxOpts
    ) => {
      const sandboxOptions =
        typeof templateOrOptions === 'string' ? options : templateOrOptions;
      const network = networks.getStore();
      const nextOptions = network
        ? { ...sandboxOptions, network }
        : sandboxOptions;

      return Reflect.apply(
        create,
        Sandbox,
        typeof templateOrOptions === 'string'
          ? [templateOrOptions, nextOptions]
          : [nextOptions]
      );
    },
  });
}

export function withSandboxNetwork<T>(
  network: SandboxNetworkOpts | undefined,
  operation: () => Promise<T>
): Promise<T> {
  return networks.run(network, operation);
}

export function createSandboxNetwork(): SandboxNetworkOpts | undefined {
  const rules: NonNullable<SandboxNetworkOpts['rules']> = {};

  if (env.AGENTMAIL_API_KEY) {
    rules['api.agentmail.to'] = [
      {
        transform: {
          headers: { Authorization: `Bearer ${env.AGENTMAIL_API_KEY}` },
        },
      },
    ];
  }

  if (env.GITHUB_TOKEN) {
    const rule = [
      {
        transform: {
          headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` },
        },
      },
    ];
    rules['api.github.com'] = rule;
    rules['uploads.github.com'] = rule;
  }

  if (Object.keys(rules).length === 0) {
    return;
  }

  return {
    rules,
  };
}

const placeholder = Buffer.from(
  "nice try, we're not leaking real creds into a sandbox",
  'utf8'
).toString('base64');

export function createSandboxEnv(): Record<string, string> {
  return {
    SSL_CERT_FILE: '/usr/lib/ssl/cert.pem',
    ...(env.AGENTMAIL_API_KEY ? { AGENTMAIL_API_KEY: placeholder } : {}),
    ...(env.GITHUB_TOKEN
      ? {
          GH_TOKEN: placeholder,
          GITHUB_TOKEN: placeholder,
        }
      : {}),
  };
}
