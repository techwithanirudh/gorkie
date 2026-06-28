import { createTool } from '@mastra/core/tools';
import Exa from 'exa-js';
import { z } from 'zod';
import { env } from '@/env';

const exa = new Exa(env.EXA_API_KEY);

export const searchWebTool = createTool({
  id: 'search_web',
  description:
    'Search the web for current information, documentation, news, and facts. Use it when you need up-to-date info rather than guessing.',
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe("A specific, clear web search query for what you're after."),
  }),
  execute: async ({ query }) => {
    const { results } = await exa.search(query, {
      type: 'auto',
      numResults: 8,
      contents: { text: { maxCharacters: 1200 } },
    });
    const links = results.slice(0, 5).map((r) => r.url);
    return {
      links,
      count: results.length,
      results: results.map((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        text: r.text ?? '',
        publishedDate: r.publishedDate,
      })),
      success: true,
      message:
        results.length === 0
          ? `Search web found no results for "${query}".`
          : `Search web found ${results.length} result${results.length === 1 ? '' : 's'} for "${query}". Top links: ${links.join(', ')}`,
    };
  },
});
