import { slack } from '../chat/client';

const MAX_ALIAS_HOPS = 5;

/**
 * Resolves a custom-emoji shortcode to its image URL via emoji.list,
 * following alias chains. Returns undefined for standard Unicode emoji
 * (no custom entry) or an unresolved alias.
 */
export async function getEmojiUrl(name: string): Promise<string | undefined> {
  const { emoji } = await slack.webClient.emoji.list();
  let current = name;
  for (let hops = 0; hops < MAX_ALIAS_HOPS; hops++) {
    const entry = emoji?.[current];
    if (!entry) {
      return;
    }
    if (!entry.startsWith('alias:')) {
      return entry;
    }
    current = entry.slice('alias:'.length);
  }
  return;
}
