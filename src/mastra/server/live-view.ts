import { randomBytes } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import type { Context } from 'hono';
import { html } from 'hono/html';
import { env } from '@/env';
import { agent } from '../config';
import { verifyLiveViewTicket } from '../lib/crypto';
import { browser } from '../workspace';

function expired(c: Context): Response {
  c.header('Cache-Control', 'no-store');
  return c.text('This live view link has expired.', 404);
}

async function viewerPage(c: Context): Promise<Response> {
  const ticket = c.req.param('ticket') ?? '';
  const live = verifyLiveViewTicket(ticket);
  if (!(live && env.PUBLIC_BASE_URL)) {
    return expired(c);
  }
  const origin = new URL(env.PUBLIC_BASE_URL);
  const socket = new URL(`/browser/${agent.id}/stream`, origin);
  socket.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  socket.searchParams.set('threadId', live.threadId);
  socket.searchParams.set('t', ticket);
  const nonce = randomBytes(16).toString('base64');
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  // Slack plays the video block's URL in an iframe, so only Slack may frame it.
  c.header(
    'Content-Security-Policy',
    `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${socket.origin}; frame-ancestors https://app.slack.com https://*.slack.com`
  );
  const body = await html`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>gorkie is browsing</title>
        <style>
          body{margin:0;background:#1d1c1d;color:#ddd;font:14px system-ui,sans-serif}
          #url{padding:6px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          img{display:block;width:100%;height:auto}
        </style>
      </head>
      <body>
        <div id="url">connecting…</div>
        <img id="frame" alt="gorkie's browser" />
        <script nonce="${nonce}">
          const url = document.getElementById('url');
          const frame = document.getElementById('frame');
          const ws = new WebSocket(${JSON.stringify(socket.toString())});
          ws.onmessage = (event) => {
            if (typeof event.data !== 'string') return;
            if (event.data.startsWith('{')) {
              const message = JSON.parse(event.data);
              if (message.url) url.textContent = message.url;
              return;
            }
            frame.src = 'data:image/jpeg;base64,' + event.data;
          };
          ws.onclose = () => { url.textContent = 'browser session ended'; };
        </script>
      </body>
    </html>`;
  return c.html(body);
}

async function thumbnail(c: Context): Promise<Response> {
  const live = verifyLiveViewTicket(c.req.param('ticket'));
  if (!live) {
    return expired(c);
  }
  const image = await browser.screenshot(live.threadId).catch(() => undefined);
  if (!image) {
    return expired(c);
  }
  c.header('Cache-Control', 'no-store');
  return c.body(new Uint8Array(image), 200, { 'Content-Type': 'image/jpeg' });
}

export const liveViewRoutes = env.PUBLIC_BASE_URL
  ? [
      registerApiRoute('/live/:ticket', {
        method: 'GET',
        requiresAuth: false,
        handler: viewerPage,
      }),
      registerApiRoute('/live/:ticket/thumb.jpg', {
        method: 'GET',
        requiresAuth: false,
        handler: thumbnail,
      }),
    ]
  : [];
