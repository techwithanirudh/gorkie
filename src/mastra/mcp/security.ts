import { promises as dns } from 'node:dns';
import ipaddr from 'ipaddr.js';

function isPublicAddress(address: string): boolean {
  return ipaddr.process(address).range() === 'unicast';
}

export async function findMCPUrlError(
  rawUrl: string
): Promise<string | undefined> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'Enter a valid URL.';
  }
  if (url.protocol !== 'https:') {
    return 'Only https:// server URLs are allowed.';
  }
  const hostname =
    url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname;
  if (ipaddr.isValid(hostname)) {
    return isPublicAddress(hostname)
      ? undefined
      : "This URL points to a private or reserved address, which isn't allowed.";
  }
  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map(
      (entry) => entry.address
    );
  } catch {
    return "Couldn't resolve that hostname.";
  }
  return addresses.some((address) => !isPublicAddress(address))
    ? "This URL resolves to a private or reserved address, which isn't allowed."
    : undefined;
}
