import { rawText, withoutLeadingMentions } from './message';
import { threadState } from './state';

// RFC i - Guidelines for AI agents in slack (Hack Club canvas F0BNTDRNL3T).
// All four checks run before command parsing and any LLM work.
interface RawTextSource {
  raw: unknown;
  text: string;
}

// Usergroup mentions arrive as <!subteam^ID> (or legacy <!subteam@ID>) and the
// built-in broadcasts are <!here>, <!channel>, and <!everyone>, optionally
// followed by a |label.
const pingGroupPattern =
  /<!subteam[^>]*>|<!(?:here|channel|everyone)(?:\|[^>]*)?>/;

function isComment(message: RawTextSource): boolean {
  for (const line of rawText(message).split('\n')) {
    if (withoutLeadingMentions(line).trimStart().startsWith('##')) {
      return true;
    }
  }
  return false;
}

export async function blockedByAgentGuidelines({
  botUserId,
  message,
  thread,
}: {
  botUserId: string | undefined;
  message: RawTextSource;
  thread: { readonly state: Promise<unknown> };
}): Promise<boolean> {
  // Rule 1: ## comments are never processed, even when the bot is mentioned.
  if (isComment(message)) {
    return true;
  }

  // Rule 2: after @gorkie !stop, ignore every later message in the thread.
  const state = await threadState(thread);
  if (state?.stopped === true) {
    return true;
  }

  const text = rawText(message);

  // Rules 3 and 4 yield only to an explicit <@USER_ID> token for the bot; a
  // bare "@gorkie" typed as plain text does not count as a direct mention.
  const directlyMentioned =
    botUserId !== undefined && text.includes(`<@${botUserId}>`);
  if (directlyMentioned) {
    return false;
  }

  // Rule 3: a ping group mention is not a bot mention.
  if (pingGroupPattern.test(text)) {
    return true;
  }

  // Rule 4: a leading <> opts the message out unless the bot is mentioned.
  return text.trimStart().startsWith('<>');
}
