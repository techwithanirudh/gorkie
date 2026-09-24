import type { RequestContext } from '@mastra/core/request-context';
import { slack as config } from '../config';

const spent = new WeakMap<RequestContext, number>();

export function spendSlackCall(requestContext?: RequestContext): void {
  if (!requestContext) {
    return;
  }
  const next = (spent.get(requestContext) ?? 0) + 1;
  spent.set(requestContext, next);
  if (next > config.callsPerTurn) {
    throw new Error(
      `This turn has made over ${config.callsPerTurn} Slack calls and further reads are blocked. Narrow the channels or time range, and answer from what you already have.`
    );
  }
}
