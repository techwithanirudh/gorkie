import Exa from 'exa-js';
import { env } from '@/env';
import { exa as config } from '../config';

export const exa = new Exa(env.EXA_API_KEY);

// exa-js passes no AbortSignal to its fetch, so a hung request cannot be
// cancelled. This abandons it instead, which frees the tool call and the turn.
export function withExaTimeout<T>({
  request,
  signal,
}: {
  request: Promise<T>;
  signal?: AbortSignal;
}): Promise<T> {
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const stopped = new Promise<never>((_, reject) => {
    const fail = () =>
      reject(
        timeout.aborted
          ? new Error(
              `Exa did not answer within ${config.timeoutMs / 1000} seconds.`
            )
          : stop.reason
      );
    if (stop.aborted) {
      fail();
      return;
    }
    stop.addEventListener('abort', fail, { once: true });
  });
  return Promise.race([request, stopped]);
}
