import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { exa } from '../lib/exa';
import { input, output } from '../types/tools/index';

export const searchWebTool = createTool({
  id: 'search_web',
  description:
    'Search the web for current information, documentation, news, and facts. Do not guess at recent or external facts. For unfamiliar names, acronyms, projects, links, screenshots, or "what is X" questions, also use search_slack when available before answering because the reference may be internal.',
  inputSchema: input({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe("A specific, clear web search query for what you're after."),
  }),
  outputSchema: output({
    links: z.array(z.url()),
    results: z.array(
      z.strictObject({
        title: z.string(),
        url: z.url(),
        text: z.string(),
        publishedDate: z.string().optional(),
      })
    ),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Found ${output?.results.length ?? 0} web results for "${input?.query ?? ''}"`,
      }),
    },
  },
  execute: async ({ query }) => {
    const { results } = await exa.search(query, {
      type: 'auto',
      numResults: 8,
      contents: { text: { maxCharacters: 1200 } },
    });
    const links = results.slice(0, 5).map((r) => r.url);
    return {
      links,
      results: results.map((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        text: r.text ?? '',
        publishedDate: r.publishedDate,
      })),
    };
  },
});
