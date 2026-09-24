import type { Context } from 'hono';
import { html } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function privateHeaders(c: Context): void {
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
}

export async function oauthPage({
  c,
  form,
  paragraphs,
  status = 200,
  title,
}: {
  c: Context;
  form?: { action: string; ticket: string };
  paragraphs: string[];
  status?: ContentfulStatusCode;
  title: string;
}): Promise<Response> {
  privateHeaders(c);
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'"
  );
  const body = await html`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${title}</title>
        <style>
          body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1d1c1d}
          button{font:inherit;padding:.5rem 1rem;border-radius:6px;border:0;background:#007a5a;color:#fff;cursor:pointer}
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${paragraphs.map((text) => html`<p>${text}</p>`)}
        ${
          form
            ? html`<form method="post" action="${form.action}">
                <input type="hidden" name="t" value="${form.ticket}" />
                <button type="submit">Continue</button>
              </form>`
            : ''
        }
        <p><a href="slack://open">Back to Slack</a></p>
      </body>
    </html>`;
  return c.html(body, status);
}
