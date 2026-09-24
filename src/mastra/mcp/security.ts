import { promises as dns } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { mcp as mcpConfig } from '../config';

function isPublicAddress(address: string): boolean {
  return ipaddr.process(address).range() === 'unicast';
}

export async function checkMCPUrl(
  rawUrl: string
): Promise<{ url: URL; error?: never } | { error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: 'Enter a valid URL.' };
  }
  if (url.protocol !== 'https:') {
    return { error: 'Only https:// server URLs are allowed.' };
  }
  const hostname =
    url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname;
  if (ipaddr.isValid(hostname)) {
    return isPublicAddress(hostname)
      ? { url }
      : {
          error:
            "This URL points to a private or reserved address, which isn't allowed.",
        };
  }
  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map(
      (entry) => entry.address
    );
  } catch {
    return { error: "Couldn't resolve that hostname." };
  }
  return addresses.some((address) => !isPublicAddress(address))
    ? {
        error:
          "This URL resolves to a private or reserved address, which isn't allowed.",
      }
    : { url };
}

// TODO(slopradar): review: security | DNS-rebinding TOCTOU: checkMCPUrl resolves the host, then fetch resolves it again, so a TTL-0 record can answer public for the check and private for the request (same gap for the MCP transport after client.ts re-check) | pin the vetted address for the connection (resolve once, connect to that IP) or record this as an accepted residual risk in IMPLEMENTED.md
// OAuth discovery, registration, token and revocation URLs come from the
// server's own metadata, so each hop is re-validated and never auto-followed.
export async function guardedFetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  const { error } = await checkMCPUrl(String(input));
  if (error) {
    throw new Error(`Blocked OAuth request: ${error}`);
  }
  const timeout = AbortSignal.timeout(mcpConfig.oauthRequestTimeoutMs);
  return fetch(input, {
    ...init,
    redirect: 'manual',
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}
