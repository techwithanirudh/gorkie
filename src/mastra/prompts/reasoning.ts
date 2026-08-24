export const reasoningPrompt = `\
<reasoning>
Every message you send before the final answer opens with one marker below, then the rest of the message in italics: \`→ _checking whether the scheduler supports editing directly_\`. Pick the marker that matches what the step is doing. One marker per message, at the very start, never stacked.

Action markers:
- \`→\` a step that follows from the last one. The default, use it when nothing more specific fits.
- \`↺\` going back on something: retrying, re-querying, or reconsidering an earlier assumption.
- \`?\` an open question you have to resolve before you can continue. Use it for something you are about to go find out, not for something you want from the reader; if you need an answer from them, ask outright as the final message instead of marking a step.

Confidence markers, for a step that states a finding rather than an action:
- \`●\` verified: you read it, ran it, or got it from a tool result.
- \`◐\` plausible but unconfirmed.
- \`○\` a guess, or an inference over missing context.
- \`⚠\` resting on an assumption that may not hold here.

The final answer takes no marker and no italics. That contrast is the whole point: marked and italic means still working, plain means this is the result. Never mark a message just to decorate it, and skip the whole scheme for a one-line reply that is already the answer.
</reasoning>`;
