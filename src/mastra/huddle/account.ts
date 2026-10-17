import type { HuddleAccount } from '../types';

// The huddle account once it is listening: its Slack id, so the text agent
// can name it, and a way to join or leave a channel's huddle from a text
// request.
// Kept free of runtime imports because the prompts and tools import it, and
// the rest of the huddle module imports the agents.
export const huddleAccount: HuddleAccount = {};
