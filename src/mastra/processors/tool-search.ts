import {
  type ProcessInputStepArgs,
  ToolSearchProcessor,
} from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { deferredTools } from '../tools/toolsets';

const searchOnlyKey = 'gorkie:searchOnlyTools';

// `includeResolvedTools` withholds every resolved tool, and `filter` can only
// hide a tool, never keep one resident. So the per-request tools that belong
// behind search are named on the request context, and only those reach the
// processor; everything else (Slack, workspace, subagents) stays in the prompt.
export function searchOnly({
  names,
  requestContext,
}: {
  names: string[];
  requestContext: RequestContext;
}): void {
  requestContext.set(searchOnlyKey, names);
}

function split({
  requestContext,
  tools,
}: {
  requestContext: RequestContext | undefined;
  tools: Record<string, unknown> | undefined;
}) {
  const names = new Set(
    z.array(z.string()).catch([]).parse(requestContext?.get(searchOnlyKey))
  );
  const resident: Record<string, unknown> = {};
  const searchable: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools ?? {})) {
    if (names.has(name)) {
      searchable[name] = tool;
    } else {
      resident[name] = tool;
    }
  }
  return { resident, searchable };
}

const search = new ToolSearchProcessor({
  tools: deferredTools,
  includeResolvedTools: true,
  // Loaded state lives in the conversation, so a load outlasts a restart. It
  // does not outlast Observational Memory: once the search result is observed
  // and leaves the context, the tool unloads and has to be searched again.
  storage: 'context',
  search: { topK: 4, autoLoad: true },
});

export const toolSearch = {
  id: search.id,
  name: search.name,
  description: search.description,
  async processInputStep(args: ProcessInputStepArgs) {
    const { resident, searchable } = split({
      requestContext: args.requestContext,
      tools: args.tools,
    });
    const { tools } = await search.processInputStep({
      ...args,
      tools: searchable,
    });
    return { tools: { ...resident, ...tools } };
  },
  // Duck-typed by the agent to rebuild loaded executors on an approval resume.
  getLoadedToolsForRequestContext(
    args: Parameters<ToolSearchProcessor['getLoadedToolsForRequestContext']>[0]
  ) {
    return search.getLoadedToolsForRequestContext({
      ...args,
      stepArgs: args?.stepArgs && {
        ...args.stepArgs,
        tools: split({
          requestContext: args.stepArgs.requestContext,
          tools: args.stepArgs.tools,
        }).searchable,
      },
      tools: split({
        requestContext: args?.requestContext,
        tools: args?.tools,
      }).searchable,
    });
  },
};
