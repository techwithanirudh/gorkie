import {
  discoverOAuthProtectedResourceMetadata,
  type MCPDiscoveryErrorDetails,
} from '@mastra/mcp';
import { z } from 'zod';
import { mcp as mcpConfig } from '../config';
import type { MCPServerConfig } from '../types';
import { guardedFetch } from './security';

const errorBodySchema = z.object({
  error: z
    .union([
      z.string(),
      z.object({ message: z.string(), code: z.number().optional() }),
    ])
    .optional(),
  error_description: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]).optional(),
  messages: z.array(z.string()).optional(),
});

function upstreamMessage({ line }: { line: string }): {
  text: string;
  rpcCode?: number;
} {
  const brace = line.indexOf('{');
  if (brace === -1) {
    return { text: line };
  }
  let json: unknown;
  try {
    json = JSON.parse(line.slice(brace));
  } catch {
    return { text: line };
  }
  const body = errorBodySchema.safeParse(json).data;
  if (!body) {
    return { text: line };
  }
  const name = typeof body.error === 'string' ? body.error : undefined;
  const rpc = typeof body.error === 'object' ? body.error : undefined;
  const joined = [body.message ?? body.messages ?? []].flat().join('; ');
  const detail = body.error_description ?? (joined || rpc?.message);
  const text =
    name && detail && name !== detail
      ? `${name}: ${detail}`
      : (name ?? detail ?? line);
  return { text, rpcCode: rpc?.code };
}

export function advertisesOAuth(url: string): Promise<boolean> {
  const signal = AbortSignal.timeout(mcpConfig.probeTimeoutMs);
  return discoverOAuthProtectedResourceMetadata(url, undefined, (input, init) =>
    guardedFetch(input, { ...init, signal })
  ).then(
    () => true,
    () => false
  );
}

async function authHint({
  server,
  status,
  transportFailed,
}: {
  server: MCPServerConfig;
  status?: number;
  transportFailed: boolean;
}): Promise<string | undefined> {
  if (status === 403) {
    return "The server accepted the credentials but denied access. Check the token's scopes or the account's permissions.";
  }
  if (status === 404 || status === 405 || transportFailed) {
    return "Check that the URL points at the server's MCP endpoint (often ending in /mcp or /sse).";
  }
  if (status !== 401) {
    return;
  }
  const oauth = await advertisesOAuth(server.url);
  if (oauth) {
    return server.token
      ? 'The server rejected the access token. It supports OAuth sign-in: remove this server, add it again without a token, then press Connect in the Home tab.'
      : 'The server uses OAuth sign-in. Press Connect on this server in the Home tab.';
  }
  if (server.token) {
    return 'The server rejected the access token, so Gorkie stopped connecting to it. Remove this server and add it again with a valid token.';
  }
  return 'The server requires authentication. Remove this server and add it again with an access token.';
}

export async function describeMCPError({
  server,
  details,
}: {
  server: MCPServerConfig;
  details: MCPDiscoveryErrorDetails;
}): Promise<string> {
  const connectPrefix = `Failed to connect to MCP server ${server.name}: `;
  const [firstLine = ''] = details.message.split('\n');
  const phase = firstLine.startsWith(connectPrefix)
    ? 'Connection failed during initialization'
    : 'Listing tools failed';
  const line = firstLine
    .replace(connectPrefix, '')
    .replace(` (HTTP ${details.httpStatus})`, '')
    .replace(/^(?:\w*Error: )+/, '')
    .replace('Error POSTing to endpoint: ', '')
    .trim();
  const { text, rpcCode } = upstreamMessage({ line });
  const clean = (
    server.token ? text.split(server.token).join('[redacted]') : text
  )
    .replace(/\b(Bearer|Basic)\s+[\w\-.~+/=]+/gi, '$1 [redacted]')
    .replace(
      /\b(authorization|cookie|x-api-key)\s*[:=]\s*[^\s,;]+/gi,
      '$1: [redacted]'
    )
    .replace(
      /([?&#](?:code|state|access_token|refresh_token|id_token|token|client_secret|api_key|key)=)[^&\s"']+/gi,
      '$1[redacted]'
    )
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[redacted]')
    .replace(/(\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1')
    .replace(/\.$/, '');
  const upstream = clean.length > 160 ? `${clean.slice(0, 160)}…` : clean;
  const status = details.httpStatus ? ` (HTTP ${details.httpStatus})` : '';
  const rpc = rpcCode === undefined ? '' : ` (MCP error ${rpcCode})`;
  const hint = await authHint({
    server,
    status: details.httpStatus,
    transportFailed: line.includes(
      'Could not connect to server with any available HTTP transport'
    ),
  });
  const message = `${phase}: ${upstream}${status}${rpc}.`;
  return hint ? `${message} ${hint}` : message;
}
