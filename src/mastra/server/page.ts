import type { Context } from 'hono';
import { html } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { OAuthPageContent } from '../types';

const icons: Record<OAuthPageContent['tone'], ReturnType<typeof html>> = {
  connect: html`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />`,
  error: html`<circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" />`,
  expired: html`<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />`,
  success: html`<circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16 9.8" />`,
};

export function privateHeaders(c: Context): void {
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
}

export async function oauthPage({
  c,
  detail,
  form,
  status = 200,
  text,
  title,
  tone,
}: OAuthPageContent & {
  c: Context;
  detail?: { label: string; value: string };
  form?: { action: string; ticket: string };
  status?: ContentfulStatusCode;
}): Promise<Response> {
  privateHeaders(c);
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'"
  );
  const body = await html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="robots" content="noindex" />
        <title>${title} · Gorkie</title>
        <style>
          :root{color-scheme:light dark;--bg:#f4f3ef;--card:#fff;--line:#e3e1db;--text:#1d1c1d;--muted:#55545a;--accent:#007a5a;--on-accent:#fff;--success:#007a5a;--error:#b42318;--expired:#8a5a00;--connect:#1264a3;--tint:7%}
          @media (prefers-color-scheme:dark){:root{--bg:#121213;--card:#1c1c1e;--line:#323236;--text:#ececee;--muted:#a9a9b0;--accent:#4cc38a;--on-accent:#04261a;--success:#4cc38a;--error:#ff8a80;--expired:#e8b54a;--connect:#6cb4f0;--tint:14%}}
          *{box-sizing:border-box}
          body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--text);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
          main{width:100%;max-width:26rem;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:0 1px 2px rgb(0 0 0/4%),0 8px 24px rgb(0 0 0/6%)}
          .brand{display:flex;align-items:center;gap:8px;margin:0 0 28px;font-weight:700;letter-spacing:-.01em;color:var(--muted);font-size:15px}
          .brand span{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--accent);color:var(--on-accent);font-size:13px;line-height:1}
          .icon{display:grid;place-items:center;width:48px;height:48px;border-radius:12px;margin-bottom:16px;color:var(--tone);background:color-mix(in srgb,var(--tone) var(--tint),transparent)}
          .icon svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
          .success{--tone:var(--success)}.error{--tone:var(--error)}.expired{--tone:var(--expired)}.connect{--tone:var(--connect)}
          h1{margin:0 0 8px;font-size:22px;line-height:1.3;letter-spacing:-.015em;overflow-wrap:anywhere}
          p{margin:0;color:var(--muted);overflow-wrap:anywhere}
          dl{margin:20px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:10px}
          dt{font-size:13px;color:var(--muted)}
          dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}
          .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
          form{display:contents}
          .btn{flex:1 1 auto;display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:0 18px;border-radius:10px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;border:1px solid transparent}
          .primary{background:var(--accent);color:var(--on-accent)}
          .secondary{background:transparent;color:var(--text);border-color:var(--line)}
          .btn:hover{filter:brightness(1.08)}
          .btn:focus-visible{outline:3px solid var(--connect);outline-offset:2px}
        </style>
      </head>
      <body>
        <main>
          <div class="brand"><span aria-hidden="true">g</span>Gorkie</div>
          <div class="icon ${tone}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${icons[tone]}</svg>
          </div>
          <h1>${title}</h1>
          <p>${text}</p>
          ${
            detail
              ? html`<dl>
                  <dt>${detail.label}</dt>
                  <dd>${detail.value}</dd>
                </dl>`
              : ''
          }
          <div class="actions">
            ${
              form
                ? html`<form method="post" action="${form.action}">
                      <input type="hidden" name="t" value="${form.ticket}" />
                      <button class="btn primary" type="submit">Continue</button>
                    </form>
                    <a class="btn secondary" href="slack://open">Cancel</a>`
                : html`<a class="btn primary" href="slack://open">Back to Slack</a>`
            }
          </div>
        </main>
      </body>
    </html>`;
  return c.html(body, status);
}
