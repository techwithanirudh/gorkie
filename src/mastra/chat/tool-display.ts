import type { ToolDisplayFn } from '@mastra/core/channels';

const MAX = 800;

// Stringify any value and clip it for display.
function format(value: unknown): string {
  let s: string;
  if (value == null) s = '';
  else if (typeof value === 'string') s = value;
  else {
    try {
      s = JSON.stringify(value, null, 2);
    } catch {
      s = String(value);
    }
  }
  return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
}

// Timeline render: title = tool, details = raw input, output = the tool's `message`
// (prefixed with *Error*: on `success: false`) or the stringified result. `task_update`
// chunks keyed by toolCallId update each row in place.
export const toolDisplay: ToolDisplayFn = (event) => {
  const id = event.toolCallId;
  const title = event.displayName;
  const details = format(event.args);

  switch (event.kind) {
    case 'running':
      return { kind: 'stream', chunk: { type: 'task_update', id, title, status: 'in_progress', details } };
    case 'result': {
      const r = event.result as { success?: boolean; message?: unknown } | null;
      const failed = event.isError || r?.success === false;
      const output =
        r && typeof r.message === 'string'
          ? `${failed ? '*Error*: ' : ''}${r.message}`
          : format(event.result);
      return { kind: 'stream', chunk: { type: 'task_update', id, title, status: failed ? 'error' : 'complete', details, output } };
    }
    case 'error':
      return { kind: 'stream', chunk: { type: 'task_update', id, title, status: 'error', details, output: `*Error*: ${format(event.errorText)}` } };
    default:
      return undefined;
  }
};
