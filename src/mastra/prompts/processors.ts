export const usageLimitPrompt =
  'This person has reached their usage limit during this turn, so your tools are off: answer now with what you have. Say plainly what is left undone and that they can ask again once the limit resets, which `!limits` shows.';

export const runLimitPrompt =
  'This run has reached a limit, so your tools are off. Report what you found now, including how sure you are and the leads you did not get to.';

export const lowQuotaPrompt = (lines: string[]) =>
  `<low_quota>\nThis person is near a usage limit:\n${lines.join('\n')}\nUse these sparingly, and tell them if something will not fit.\n</low_quota>`;
