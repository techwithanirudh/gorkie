export const outputBudgetPrompt =
  'This turn has used its output budget, so your tools are off. Answer now with what you have, and say plainly what is left undone so the person can ask you to continue.';

export const leakedToolCallReason =
  'a tool call came out as plain text markup (<tool_call>, <arg_key>, <arg_value>) instead of a real function call, so it never ran. Make every call through the function-calling interface';
