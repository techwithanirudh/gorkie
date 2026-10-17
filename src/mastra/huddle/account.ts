// The huddle account's Slack id once it is listening, so the text agent can
// tell people who to invite. Kept dependency free because the prompts import
// it, and the rest of the huddle module imports the agents.
export const huddleAccount: { userId?: string } = {};
