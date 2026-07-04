import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { exa } from '../lib/exa';

export const fetchUrlTool = createTool({
  id: 'fetch_url',
  description:
    'Fetch the readable content of a specific, known URL (an article, doc page, README, or link someone shared). Not for search; use search_web to find URLs first.',
  inputSchema: z.object({
    url: z.url().describe('The exact URL to fetch.'),
  }),
  execute: async ({ url }) => {
    const [result] = (
      await exa.getContents([url], {
        text: { maxCharacters: 8000 },
        livecrawl: 'preferred',
      })
    ).results;
    if (!result) {
      return {
        success: false,
        message: `Could not fetch content from ${url}.`,
      };
    }
    return {
      success: true,
      url: result.url,
      title: result.title ?? result.url,
      text: result.text ?? '',
      message: `Fetched ${result.text?.length ?? 0} characters from ${result.url}.`,
    };
  },
});
