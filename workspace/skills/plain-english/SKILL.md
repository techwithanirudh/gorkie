---
name: plain-english
description: Answer in short, plain English. Use when someone asks for a simpler, shorter, or less technical answer ("explain like I'm new", "tl;dr", "in plain English", "too long", "what does this actually mean"), when the reader is outside the field, or when rewriting jargon-heavy text such as an error, a changelog, a contract clause, or a PR description for a general audience.
---

# Plain English

The reader should get the point in one pass, without a glossary.

## Shape

1. **Answer first.** The first sentence is the answer or the decision. Background
   comes after, and only if it changes what they do next.
2. **Keep it short.** Three to five sentences covers most answers. If you need
   more, use a short list, not longer paragraphs.
3. **End on the action.** If there is something for them to do, the last line
   says what.

## Words

- Use the everyday word: "use" not "utilize", "start" not "initialize", "about"
  not "approximately", "so" not "therefore".
<!-- TODO(slopradar): cross-skill contradiction | the parenthetical gloss taught here ("the cache (a saved copy...)") is what the unslop skill (item 13) bans | pick one rule; a comma gloss satisfies both -->
- Name a technical term only when the reader will meet it again. Explain it once,
  in a few words, the first time: "the cache (a saved copy, so the page loads
  faster)".
- Replace an acronym with what it stands for, unless the reader already uses it.
- Prefer a concrete example to an abstract rule. "If you close the tab, the upload
  stops" beats "the operation is not resumable".
- Use numbers you checked, and round them only when the precision does not matter.

## Sentences

- One idea per sentence. Split anything with two "and"s or a semicolon.
- Active voice with a named actor: "Slack deleted the message", not "the message
  was deleted".
- Say "you" to the reader, "I" for yourself.
- No hedging stacks ("it might possibly be worth considering"). Say how sure you
  are once: "probably", "I checked", or "I have not verified this".

## What not to cut

Short is not the same as vague. Keep the one caveat that would change their
decision, the number that matters, and the link they need. Drop the history, the
alternatives they did not ask about, and the restated question.

## Check before sending

Read it as someone who was not in the thread. If a sentence needs the one before
it to make sense, or a word needs looking up, fix that sentence.
