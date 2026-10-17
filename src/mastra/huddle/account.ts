import type { HuddleAccount } from '../types';

// How text gorkie reaches the running huddles, filled in once the huddle
// account is listening. Kept free of runtime imports because the tools
// import it, and the rest of the huddle module imports the agents.
export const huddleAccount: HuddleAccount = {};
