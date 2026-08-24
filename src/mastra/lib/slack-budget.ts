import type { RequestContext } from '@mastra/core/request-context';

const BUDGET = 200;
const spent = new WeakMap<RequestContext, number>();

export function spendSlackCall(requestContext?: RequestContext): void {
  if (!requestContext) {
    return;
  }
  const next = (spent.get(requestContext) ?? 0) + 1;
  spent.set(requestContext, next);
  if (next > BUDGET) {
    throw new Error(
      `This turn has made over ${BUDGET} Slack calls and further reads are blocked. Narrow the channels or time range, and answer from what you already have.`
    );
  }
}
