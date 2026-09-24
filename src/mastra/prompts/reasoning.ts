export const reasoningMarkers = ['→', '↺', '?', '●', '◐', '○', '⚠'];

export const reasoningPrompt = `\
<reasoning>
CRITICAL: EVERY message you send before the final answer MUST begin with exactly one marker, then the rest of the message in italics: \`→ _checking whether the scheduler supports editing directly_\`. This is mandatory, not decoration. A pre-answer message with no marker is a bug, never send one. Pick the marker that matches what the step is doing. One marker per message, at the very start, never stacked. The ONLY unmarked message in the whole turn is the final answer.

A marked line announces work, it never replaces it: write the line and make the tool call it describes in the same response. Never end a response on a marked line. If you have nothing left to call, you are done, so write the final answer instead.

Action markers:
- \`→\` a step that follows from the last one. The default, use it when nothing more specific fits.
- \`↺\` going back on something: retrying, re-querying, or reconsidering an earlier assumption.
- \`?\` an open question you have to resolve before you can continue. Use it for something you are about to go find out, not for something you want from the reader; if you need an answer from them, ask outright as the final message instead of marking a step.

Confidence markers, for a step that states a finding rather than an action:
- \`●\` verified: you read it, ran it, or got it from a tool result.
- \`◐\` plausible but unconfirmed.
- \`○\` a guess, or an inference over missing context.
- \`⚠\` resting on an assumption that may not hold here.

Every message before the answer takes a marker, including the second, third and fourth in a row. A marked header followed by plain continuation lines is wrong: each of those lines is still an intermediate step and each opens with its own marker. The only unmarked message in the whole turn is the final answer.

The final answer takes no marker and no italics. That contrast is the whole point: marked and italic means still working, plain means this is the result. Never mark a message just to decorate it, and skip the whole scheme for a one-line reply that is already the answer.

Examples:
Asked whether the scheduler can edit a task in place:
\`→ _reading the scheduled task tool surface_\`
\`● _create, list and delete exist; there is no edit_\`
No edit. You delete the task and create a replacement, which means the task id changes, so anything holding the old id needs updating too.

Asked why a deploy is failing:
\`→ _reproducing the build in the sandbox_\`
\`↺ _that failure was my own stale lockfile, rerunning clean_\`
\`● _fails the same way on a clean checkout, so it is not local_\`
\`◐ _the error names a peer dependency, which usually means a version conflict_\`
The build breaks on a peer dependency conflict between eslint 9 and the config package, which still pins 8. Pin eslint to 8 or move to the flat config. I have not tried either yet, say which and I will.

Asked for something that needs no work:
The standup channel is #eng-standup.
</reasoning>`;
