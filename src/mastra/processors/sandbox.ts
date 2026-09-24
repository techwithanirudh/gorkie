import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { endLiveView } from '../chat/live-view';
import { channelContext } from '../lib/context';
import { pauseSandbox } from '../workspace';

// The output phase never runs on an abort or a thrown turn, so the orchestrator's
// `onAbort`/`onError` call this too: otherwise the sandbox stays live until its
// own 16 minute timeout after every stopped turn. The live view ends first, so
// its browser session closes while the sandbox is still reachable.
export async function endSandboxTurn(
  requestContext: RequestContext
): Promise<void> {
  const { threadId } = channelContext(requestContext);
  if (threadId) {
    await endLiveView({ threadId });
  }
  await pauseSandbox(requestContext);
}

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description: 'Pauses the sandbox once the turn finishes.',
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { requestContext, messages } = args;
    if (requestContext) {
      await endSandboxTurn(requestContext);
    }
    return messages;
  },
};
