export const outputBudgetPrompt =
  'This turn has used its output budget, so your tools are off. Answer now with what you have, and say plainly what is left undone so the person can ask you to continue.';

export const leakedToolCallReason =
  'a tool call came out as plain text markup (<tool_call>, <arg_key>, <arg_value>) instead of a real function call, so it never ran. Make every call through the function-calling interface';

export const imageOmittedNote =
  "Image omitted to stay within the model's image limit. View it again (view_image, or get_slack_file then view_image for a Slack upload) if you still need it.";

export const imageAttachedNote = 'Image attached in the following message.';

export const attachedMediaNote = 'Attached media from tool result:';
