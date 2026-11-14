export const usageLimitPrompt =
  'This person has reached their usage limit during this turn, so your tools are disabled for the rest of it. Write your final answer now, as text, from what you already have. Say plainly what is left undone and that they can ask again once the limit resets, which `!limits` shows.';

export const runLimitPrompt =
  'This run has reached its limit. Your tools are disabled for the rest of it, so do not plan more steps. Write your final answer to the person now, as text, from what you already have: what you found, how sure you are, and what is left undone.';

export const lowQuotaPrompt = (lines: string[]) =>
  `<low_quota>\nThis person is near a usage limit:\n${lines.join('\n')}\nUse these sparingly, and tell them if something will not fit.\n</low_quota>`;
