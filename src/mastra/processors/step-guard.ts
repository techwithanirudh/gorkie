import type { Processor } from '@mastra/core/processors';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { leakedToolCallReason } from '../prompts/processors';

interface Scan {
  carry: string;
  leaked: boolean;
  mode: 'text' | 'think' | 'annotation' | 'tool_call';
}

const markupTags = [
  'think',
  'annotation',
  'tool_call',
  'arg_key',
  'arg_value',
].flatMap((name) => [
  { closing: false, name, tag: `<${name}>` },
  { closing: true, name, tag: `</${name}>` },
]);
const turns = new WeakMap<object, { scan: Scan; retried: boolean }>();

function freshScan(): Scan {
  return { mode: 'text', carry: '', leaked: false };
}

// When an upstream parser misses a GLM tool call it arrives as text, often only
// a fragment (`<arg_value>C0...</tool_call>`) with no name to rebuild it from,
// so everything from the first tool tag to `</tool_call>` or the step end goes.
function nextTag(
  text: string
): ((typeof markupTags)[number] & { index: number }) | undefined {
  for (let at = text.indexOf('<'); at !== -1; at = text.indexOf('<', at + 1)) {
    const found = markupTags.find(({ tag }) => text.startsWith(tag, at));
    if (found) {
      return { ...found, index: at };
    }
  }
}

function scrub({ scan, text }: { scan: Scan; text: string }): string {
  let rest = scan.carry + text;
  let out = '';
  scan.carry = '';
  for (let match = nextTag(rest); match; match = nextTag(rest)) {
    const { closing, index, name, tag } = match;
    if (scan.mode === 'text') {
      out += rest.slice(0, index);
    }
    rest = rest.slice(index + tag.length);
    if (scan.mode !== 'text') {
      if (closing && name === scan.mode) {
        scan.mode = 'text';
      }
      continue;
    }
    if (name === 'think' || name === 'annotation') {
      scan.mode = closing ? 'text' : name;
      continue;
    }
    scan.leaked = true;
    scan.mode = closing ? 'text' : 'tool_call';
  }
  const open = rest.lastIndexOf('<');
  const tail = open === -1 ? '' : rest.slice(open);
  if (tail && markupTags.some(({ tag }) => tag.startsWith(tail))) {
    scan.carry = tail;
    rest = rest.slice(0, -tail.length);
  }
  return scan.mode === 'text' ? out + rest : out;
}

function turnOf(state: object) {
  const existing = turns.get(state);
  if (existing) {
    return existing;
  }
  const turn = { scan: freshScan(), retried: false };
  turns.set(state, turn);
  return turn;
}

export const stepGuard = {
  id: 'step-guard',
  name: 'Step Guard',
  description:
    'Keeps model-internal markup out of the reply and re-prompts once when a tool call leaks as text.',
  processOutputStream({ part, state }) {
    if (part.type !== 'text-delta') {
      return Promise.resolve(part);
    }
    const text = scrub({ scan: turnOf(state).scan, text: part.payload.text });
    return Promise.resolve(
      text ? { ...part, payload: { ...part.payload, text } } : null
    );
  },
  processOutputStep({ abort, messageList, requestContext, state, text }) {
    const turn = turnOf(state);
    turn.scan = freshScan();
    if (turn.retried) {
      return messageList;
    }
    const scan = freshScan();
    scrub({ scan, text: text ?? '' });
    if (!scan.leaked) {
      return messageList;
    }
    turn.retried = true;
    logger.warn('[step-guard] retrying step', {
      threadId: channelContext(requestContext).threadId,
    });
    return abort(leakedToolCallReason, { retry: true });
  },
  processOutputResult({ messages }) {
    return messages.map((message) => ({
      ...message,
      content: {
        ...message.content,
        parts: message.content.parts.map((part) =>
          part.type === 'text'
            ? { ...part, text: scrub({ scan: freshScan(), text: part.text }) }
            : part
        ),
      },
    }));
  },
} satisfies Processor<'step-guard'>;
