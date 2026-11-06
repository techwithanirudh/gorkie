export const outputBudgetPrompt =
  'This turn has used its output budget, so your tools are off. Answer now with what you have, and say plainly what is left undone so the person can ask you to continue.';

export const runLimitPrompt =
  'This run has reached a limit, so your tools are off. Report what you found now, including how sure you are and the leads you did not get to.';

export const lowQuotaPrompt = (lines: string[]) =>
  `<low_quota>\nThis person is near an hourly limit:\n${lines.join('\n')}\nUse these sparingly, and tell them if something will not fit.\n</low_quota>`;

export const leakedToolCallReason =
  'a tool call came out as plain text markup (<tool_call>, <arg_key>, <arg_value>) instead of a real function call, so it never ran. Make every call through the function-calling interface';
