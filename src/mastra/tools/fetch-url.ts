import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { exa } from '../lib/exa';
import { input, output } from '../types/tools/index';

const FETCH_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms.`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export const fetchUrlTool = createTool({
  id: 'fetch_url',
  description: `Fetch a readable excerpt from a specific, known public URL (an article, doc page, README, or link someone shared). Not for search; use search_web to find URLs first.

This extracts readable article content, so it fails on anything that isn't a plain public page:
- GitHub source/directory pages (blob, tree, raw.githubusercontent.com); clone the repo or use the gh CLI instead.
- Authenticated or private services: Google Docs, Confluence, Jira, internal wikis, paywalled articles.
- Slack URLs; use Slack tools instead.
- Search result or directory listing pages.
- Raw/binary file downloads: PDFs, images, zips.`,
  inputSchema: input({
    url: z.url().describe('The exact URL to fetch.'),
  }),
  outputSchema: output({
    url: z.url(),
    title: z.string(),
    text: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.title ?? output?.url ?? 'URL fetched',
      }),
    },
  },
  execute: async ({ url }) => {
    // A slow or hanging page here has no bound of its own, and used to be
    // able to block the whole step (and by extension the turn) with no
    // error and no trace, since the agent-level step timeout only fires
    // between steps, not inside one still-running tool call.
    const [result] = (
      await withTimeout(
        exa.getContents([url], {
          text: { maxCharacters: 8000 },
          livecrawl: 'preferred',
        }),
        FETCH_TIMEOUT_MS,
        `Fetching ${url}`
      )
    ).results;
    if (!result) {
      throw new Error(`Could not fetch content from ${url}.`);
    }
    return {
      url: result.url,
      title: result.title ?? result.url,
      text: result.text ?? '',
    };
  },
});
