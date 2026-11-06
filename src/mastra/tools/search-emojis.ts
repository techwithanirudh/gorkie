import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { emoji } from '../config';
import { logger } from '../lib/logger';
import { input, output } from '../types/tools/index';

const searchResponse = z.object({
  results: z.array(
    z.looseObject({ name: z.string(), summary: z.string().optional() })
  ),
});

export const searchEmojisTool = createTool({
  id: 'search_emojis',
  description:
    'Find this workspace\'s custom emoji by meaning, such as "crying laughing" or "happy cat". Returns names to use in react or as :name: in a message. Use it when a custom emoji would fit and you don\'t already know one.',
  inputSchema: input({
    query: z.string().min(1).max(300).describe('What the emoji should show.'),
  }),
  outputSchema: output({
    emojis: z.array(
      z.strictObject({ name: z.string(), summary: z.string().optional() })
    ),
    note: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Found ${output?.emojis.length ?? 0} emoji`,
      }),
    },
  },
  execute: async ({ query }) => {
    const url = new URL('/v1/search', emoji.searchUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(emoji.searchResults));
    url.searchParams.set('mode', 'hybrid');
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(emoji.searchTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Emoji search returned ${response.status}.`);
      }
      const { results } = searchResponse.parse(await response.json());
      return {
        emojis: results.map(({ name, summary }) => ({
          name: name.replaceAll(':', ''),
          summary: summary?.slice(0, 160),
        })),
      };
    } catch (error) {
      logger.warn('[emoji] search failed', { error, query });
      return {
        emojis: [],
        note: 'Emoji search is unavailable. Use a standard emoji such as thumbsup, eyes, tada or joy.',
      };
    }
  },
});
