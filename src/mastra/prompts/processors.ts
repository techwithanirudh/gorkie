export const outputBudgetPrompt =
  'This turn has used its output budget, so call `reply` now with what you have, and say plainly what is left undone so the person can ask you to continue.';

export const cutOffReplyPrompt =
  'Your last response hit the output limit and was cut off, so nothing reached the person. Think briefly, then call `reply` now with a much shorter answer, and say what you left out so they can ask for the rest.';

export const runLimitPrompt =
  'This run has reached a limit, so your tools are off. Report what you found now, including how sure you are and the leads you did not get to.';

export const lowQuotaPrompt = (lines: string[]) =>
  `<low_quota>\nThis person is near a usage limit:\n${lines.join('\n')}\nUse these sparingly, and tell them if something will not fit.\n</low_quota>`;

export const leakedToolCallReason =
  'a tool call came out as plain text markup (<tool_call>, <arg_key>, <arg_value>) instead of a real function call, so it never ran. Make every call through the function-calling interface';
