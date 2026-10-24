import { fetchSlackFile } from '@chat-adapter/slack/api';
import type { RequestContext } from '@mastra/core/request-context';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { firstReadable } from './access';

export async function readableFile({
  fileId,
  requestContext,
}: {
  fileId: string;
  requestContext: RequestContext;
}) {
  const { file } = await slack.webClient.files.info({ file: fileId });
  if (!file) {
    throw new Error(`Slack file ${fileId} was not found.`);
  }
  const channelIds = [
    ...(file.channels ?? []),
    ...(file.groups ?? []),
    ...(file.ims ?? []),
  ];
  if (channelIds.length === 0) {
    throw new Error('This Slack resource is not associated with a channel.');
  }
  if (
    !(await firstReadable({ channelIds, ctx: channelContext(requestContext) }))
  ) {
    throw new Error(
      'Reading or editing Slack resources from another private conversation is not allowed.'
    );
  }
  return { file, channelIds };
}

// fetchSlackFile attaches the token only for Slack's own hosts, and
// `redirect: 'manual'` keeps a redirect from carrying it anywhere else.
export function fetchPrivateSlackFile({
  url,
  init,
}: {
  url: string;
  init?: RequestInit;
}): Promise<Response> {
  return fetchSlackFile({
    fetch: Object.assign(
      (input: URL | RequestInfo, auth?: RequestInit) =>
        fetch(input, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(auth?.headers)),
            ...Object.fromEntries(new Headers(init?.headers)),
          },
          redirect: 'manual',
        }),
      { preconnect: fetch.preconnect }
    ),
    token: env.SLACK_BOT_TOKEN,
    url,
  });
}
