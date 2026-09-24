---
name: web-page
description: Build a self-contained HTML page and put it behind a link gorkie can paste into Slack. Use when an answer is better looked at than read, such as a chart or dashboard, a table too wide for a Slack message, a comparison, a timeline, or a summary someone will want to share. Also use whenever the user asks for a page, a mockup, a visualization, a report, or something they can look at. Produces one HTML file deployed to a temporary Cloudflare Worker, so the user gets a live URL that stays up for 60 minutes.
---

# web-page

Some answers do not belong in a Slack message. A ten-row table, a chart, a week
of build failures grouped by cause, a side-by-side of two proposals: Slack
flattens all of it. A web page is the escape hatch. One HTML file, one link.

For a full site or app with its own build, load the `wrangler` skill instead.
This skill is for a single page that shows an answer.

## When to build one, and when not to

Build one when the shape of the answer is the point: anything tabular past a few
rows, anything comparative, anything someone will want to send to a person who
is not in the thread.

Do not build one for an answer that is three sentences long. A link is friction,
and a link to a paragraph is worse than the paragraph. If the whole answer fits
comfortably in a Slack message, post the Slack message.

Never put a secret, a credential, an access token, or anything from a DM or a
private channel into a page. A temporary Worker URL is public to anyone holding it.

## How to build one

1. **Write one self-contained HTML file.** Inline the CSS and any JavaScript.
   No CDN links, no external fonts, no remote images: the page has to survive
   being opened on someone's phone on a train. If you have data, inline it as a
   literal rather than fetching it.
2. **Make it readable in both themes**, or commit to one and set the background
   explicitly. A page that inherits a dark background and paints dark text on it
   is unreadable.
3. **Look at it before you share it.** Open the deployed URL with agent-browser,
   take a screenshot, and check it with `view_image`. A page you never looked at
   is a page you cannot vouch for.

## How to publish it

Deploy it as a temporary Cloudflare Worker that serves the file as a static asset:

```bash
mkdir -p /home/user/web-page/public && cd /home/user/web-page
# write your page to public/index.html
cat > wrangler.jsonc <<'JSON'
{
  "name": "gorkie-web-page",
  "compatibility_date": "2026-09-21",
  "assets": { "directory": "./public" }
}
JSON
wrangler deploy --temporary
```

`--temporary` needs no Cloudflare account and no token. It prints a live
`*.workers.dev` URL and a claim URL. Share both, as the `wrangler` skill says:
the live URL to view it, the claim URL for someone who wants to keep it.

**Say plainly that the link dies in 60 minutes unless someone claims it.**
Someone who reads the message tomorrow and finds a dead link will assume gorkie
broke, not that they missed an expiry nobody mentioned. If something is worth
keeping and nobody will claim it, put the substance in the Slack message too, or
upload the HTML file with `upload_file`, and let the page be the view of it.

To revise it, edit the file and run `wrangler deploy --temporary` again inside
the 60-minute window; it reuses the same temporary account and the same URL.

A fresh subdomain can take a minute to get its TLS certificate, so an
`ERR_SSL_VERSION_OR_CIPHER_MISMATCH` immediately after deploying is normal.
Wait and retry before reporting it as broken.
