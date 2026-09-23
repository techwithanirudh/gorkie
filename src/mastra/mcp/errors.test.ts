import { afterAll, describe, expect, test } from 'bun:test';
import type { MCPServerConfig } from '../types';
import { describeMCPError } from './errors';

const twentyBody =
  '{"statusCode":401,"error":"UnauthorizedException","messages":["Unauthorized"]}';

function connectFailure({ body, status }: { body: string; status: number }) {
  return {
    message: `Failed to connect to MCP server srv: SdkHttpError: Error POSTing to endpoint: ${body}\n    at _send (index.mjs:5380:15)\n    at processTicksAndRejections (native) (HTTP ${status})`,
    httpStatus: status,
    code: 'CLIENT_HTTP_NOT_IMPLEMENTED',
  };
}

const otherHostHits: string[] = [];
const otherHost = Bun.serve({
  port: 0,
  fetch(request) {
    otherHostHits.push(new URL(request.url).pathname);
    return Response.json({ resource: 'x', authorization_servers: ['x'] });
  },
});

const metadataHost = Bun.serve({
  port: 0,
  fetch(request) {
    const { origin, pathname } = new URL(request.url);
    if (pathname === '/.well-known/oauth-protected-resource/oauth/mcp') {
      return Response.json({
        resource: `${origin}/oauth/mcp`,
        authorization_servers: [origin],
      });
    }
    if (pathname.startsWith('/.well-known/oauth-protected-resource/redirect')) {
      return Response.redirect(
        `http://localhost:${otherHost.port}/.well-known/oauth-protected-resource`,
        302
      );
    }
    return new Response('not found', { status: 404 });
  },
});

afterAll(() => {
  metadataHost.stop(true);
  otherHost.stop(true);
});

function server({
  path,
  token,
}: {
  path: string;
  token?: string;
}): MCPServerConfig {
  return {
    name: 'srv',
    url: `http://localhost:${metadataHost.port}${path}`,
    permission: 'write',
    ...(token ? { token } : {}),
  };
}

describe('describeMCPError', () => {
  test('Twenty 401 with a token on an OAuth server', async () => {
    const message = await describeMCPError({
      server: server({ path: '/oauth/mcp', token: 'secret-token' }),
      details: connectFailure({ body: twentyBody, status: 401 }),
    });
    expect(message).toBe(
      'Connection failed during initialization: UnauthorizedException: Unauthorized (HTTP 401). The server rejected the access token. It advertises OAuth sign-in, which Gorkie does not support yet; use an API key or personal access token if the server offers one.'
    );
    for (const noise of [
      'SdkHttpError',
      'at _send',
      'CLIENT_HTTP_NOT_IMPLEMENTED',
    ]) {
      expect(message).not.toContain(noise);
    }
  });

  test('Twenty 401 without a token on an OAuth server', async () => {
    const message = await describeMCPError({
      server: server({ path: '/oauth/mcp' }),
      details: connectFailure({ body: twentyBody, status: 401 }),
    });
    expect(message).toContain('The server requires sign-in');
    expect(message).toContain('advertises OAuth');
  });

  test('401 with a token and no OAuth metadata', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp', token: 'secret-token' }),
      details: connectFailure({ body: twentyBody, status: 401 }),
    });
    expect(message).toContain('may require OAuth');
  });

  test('401 without a token and no OAuth metadata', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp' }),
      details: connectFailure({ body: twentyBody, status: 401 }),
    });
    expect(message).toContain('requires authentication');
    expect(message).toContain('add it again with an access token');
  });

  test('OAuth RFC 6750 body', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp', token: 'secret-token' }),
      details: connectFailure({
        body: '{"error":"invalid_token","error_description":"Missing or invalid access token"}',
        status: 401,
      }),
    });
    expect(message).toContain(
      'invalid_token: Missing or invalid access token (HTTP 401).'
    );
  });

  test('403 plain text', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp', token: 'secret-token' }),
      details: connectFailure({ body: 'Forbidden', status: 403 }),
    });
    expect(message).toContain('Forbidden (HTTP 403).');
    expect(message).toContain("token's scopes");
  });

  test('JSON-RPC error body', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp' }),
      details: {
        message:
          'Failed to connect to MCP server srv: {"jsonrpc":"2.0","id":1,"error":{"code":-32001,"message":"Session expired"}}',
      },
    });
    expect(message).toBe(
      'Connection failed during initialization: Session expired (MCP error -32001).'
    );
  });

  test('list phase', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp' }),
      details: { message: 'McpError: Request timed out' },
    });
    expect(message).toBe('Listing tools failed: Request timed out.');
  });

  test('transport fallback failure', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp' }),
      details: {
        message:
          'Failed to connect to MCP server srv: Could not connect to server with any available HTTP transport',
      },
    });
    expect(message).toContain("points at the server's MCP endpoint");
  });

  test('redacts secrets from upstream text', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp', token: 'tok-12345' }),
      details: {
        message:
          'Failed to connect to MCP server srv: bad tok-12345 Bearer abc.def at https://h/cb?code=xyz&state=s jwt eyJ0e.eyJ1c.sig via https://u:p@host/mcp',
      },
    });
    for (const secret of [
      'tok-12345',
      'abc.def',
      'xyz',
      'state=s',
      'eyJ0e',
      'u:p@',
    ]) {
      expect(message).not.toContain(secret);
    }
  });

  test('redirecting metadata is treated as no OAuth and not followed', async () => {
    const message = await describeMCPError({
      server: server({ path: '/redirect/mcp', token: 'secret-token' }),
      details: connectFailure({ body: twentyBody, status: 401 }),
    });
    expect(message).toContain('may require OAuth');
    expect(otherHostHits).toEqual([]);
  });

  test('caps the upstream part and keeps the hint', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp' }),
      details: connectFailure({ body: 'x'.repeat(500), status: 403 }),
    });
    expect(message).toContain(`${'x'.repeat(160)}… (HTTP 403).`);
    expect(message).not.toContain('x'.repeat(161));
    expect(message).toEndWith("the account's permissions.");
  });

  test('malformed JSON keeps the raw line', async () => {
    const message = await describeMCPError({
      server: server({ path: '/plain/mcp' }),
      details: {
        message: 'Failed to connect to MCP server srv: broken {"error": ',
      },
    });
    expect(message).toBe(
      'Connection failed during initialization: broken {"error":.'
    );
  });
});
