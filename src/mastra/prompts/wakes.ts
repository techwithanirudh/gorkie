export const wakes = {
  waitOver: ({ reason, seconds }: { reason: string; seconds: number }) =>
    `Your ${seconds}s wait is over (waiting for: ${reason}). Continue and respond in this same Slack conversation with the result.`,
  backgroundJobDone: ({
    outcome,
    reason,
  }: {
    outcome: string;
    reason: string | undefined;
  }) =>
    `Your background job${reason ? ` (${reason})` : ''} ${outcome}. Its result is in the run_background tool output. Report it to the person in this thread.`,
  askAnswered: ({
    choice,
    question,
    requester,
  }: {
    choice: string;
    question: string;
    requester: string;
  }) =>
    `<@${requester}> answered your ask_user question "${question}" by clicking "${choice}". Carry on from that answer in this Slack conversation.`,
};
