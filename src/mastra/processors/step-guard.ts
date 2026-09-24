import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
  ProcessOutputStreamArgs,
} from '@mastra/core/processors';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { reasoningMarkers } from '../lib/reasoning-markers';

interface Scan {
  carry: string;
  leaked: boolean;
  mode: 'text' | 'think' | 'annotation' | 'tool_call';
}

const markupTag = /<(\/?)(think|annotation|tool_call|arg_key|arg_value)>/;
const markupTags = [
  'think',
  'annotation',
  'tool_call',
  'arg_key',
  'arg_value',
].flatMap((name) => [`<${name}>`, `</${name}>`]);
// The emoji variation selector is optional: models emit ⚠ both with and
// without it.
const narrationLine = new RegExp(
  `^(?:${reasoningMarkers.map((marker) => marker.replace(/[?]/g, '\\$&')).join('|')})\uFE0F?\\s`
);
const turns = new WeakMap<object, { scan: Scan; retried: boolean }>();

function freshScan(): Scan {
  return { mode: 'text', carry: '', leaked: false };
}

// When an upstream parser misses a GLM tool call it arrives as text, often only
// a fragment (`<arg_value>C0...</tool_call>`) with no name to rebuild it from,
// so everything from the first tool tag to `</tool_call>` or the step end goes.
function scrub({ scan, text }: { scan: Scan; text: string }): string {
  let rest = scan.carry + text;
  let out = '';
  scan.carry = '';
  for (let match = markupTag.exec(rest); match; match = markupTag.exec(rest)) {
    const [tag, closing, name] = match;
    if (scan.mode === 'text') {
      out += rest.slice(0, match.index);
    }
    rest = rest.slice(match.index + tag.length);
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
  if (tail && markupTags.some((t) => t.startsWith(tail))) {
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
    'Keeps model-internal markup out of the reply and re-prompts once when a step stalls on a leaked tool call or a lone progress line.',
  processOutputStream({ part, state }: ProcessOutputStreamArgs) {
    if (part.type !== 'text-delta') {
      return Promise.resolve(part);
    }
    const text = scrub({ scan: turnOf(state).scan, text: part.payload.text });
    return Promise.resolve(
      text ? { ...part, payload: { ...part.payload, text } } : null
    );
  },
  processOutputStep({
    abort,
    messageList,
    requestContext,
    state,
    text,
    toolCalls,
  }: ProcessOutputStepArgs) {
    const turn = turnOf(state);
    turn.scan = freshScan();
    if (turn.retried) {
      return messageList;
    }
    const scan = freshScan();
    const lines = scrub({ scan, text: text ?? '' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const stalled =
      !toolCalls?.length &&
      lines.length > 0 &&
      lines.every((line) => narrationLine.test(line));
    const { leaked } = scan;
    if (!(leaked || stalled)) {
      return messageList;
    }
    turn.retried = true;
    logger.warn('[step-guard] retrying step', {
      leaked,
      stalled,
      threadId: channelContext(requestContext).threadId,
    });
    return abort(
      leaked
        ? 'a tool call came out as plain text markup (<tool_call>, <arg_key>, <arg_value>) instead of a real function call, so it never ran. Make every call through the function-calling interface'
        : 'you sent a progress line and ended the response without calling a tool, so the work you announced never ran. The user already saw that line: do not repeat it. Make the tool call now, or, if the work is actually done, give the final answer',
      { retry: true }
    );
  },
  processOutputResult({ messages }: ProcessOutputResultArgs) {
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
};
