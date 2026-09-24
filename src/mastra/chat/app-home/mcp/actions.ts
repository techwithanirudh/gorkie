import { Chat, Modal, type ModalErrorsResponse, TextInput } from 'chat';
import { mcp } from '../../../config';
import { setMCPOAuthStatus } from '../../../db/queries/mcp-oauth';
import {
  insertMCPServer,
  listMCPServers,
  removeMCPServer,
  setMCPServerError,
  setMCPServerPermission,
} from '../../../db/queries/mcps';
import { setMCPThreads } from '../../../db/queries/settings';
import { logger } from '../../../lib/logger';
import { advertisesOAuth } from '../../../mcp/errors';
import { revokeMCPOAuth } from '../../../mcp/oauth';
import { checkMCPUrl } from '../../../mcp/security';
import { dropClient } from '../../../mcp/user-servers/client';
import { probeMCPConnection } from '../../../mcp/user-servers/probe';
import {
  mcpServerSchema,
  type PublishHome,
  toolPermissionSchema,
} from '../../../types';
import { ids } from './ids';
import { configureModal } from './views';

async function addServer({
  publishHome,
  userId,
  values,
}: {
  publishHome: PublishHome;
  userId: string;
  values: Record<string, string | undefined>;
}): Promise<ModalErrorsResponse | undefined> {
  const parsed = mcpServerSchema.safeParse({
    name: values.name?.trim(),
    url: values.url?.trim(),
    token: values.token?.trim() || undefined,
  });
  if (!parsed.success) {
    // TODO(slopradar): AGENTS: prefer libraries | hand-rolled first-issue-per-field map; zod 4 ships z.flattenError(error).fieldErrors | map fieldErrors to their first message
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [field] = issue.path;
      if (typeof field === 'string' && !errors[field]) {
        errors[field] = issue.message;
      }
    }
    return { action: 'errors', errors };
  }

  const isGitHub = new URL(parsed.data.url).host === 'api.githubcopilot.com';
  if (isGitHub || parsed.data.name.toLowerCase() === 'github') {
    const message =
      'GitHub has its own section above. Use Connect GitHub there instead.';
    return {
      action: 'errors',
      errors: isGitHub ? { url: message } : { name: message },
    };
  }
  const { error: urlError } = await checkMCPUrl(parsed.data.url);
  if (urlError) {
    return { action: 'errors', errors: { url: urlError } };
  }
  const result = await insertMCPServer({
    userId,
    server: parsed.data,
    maxServers: mcp.maxServers,
  });
  if (result === 'name-taken') {
    return {
      action: 'errors',
      errors: {
        name: `The name "${parsed.data.name}" is already in use. Pick another name, or remove the existing server first.`,
      },
    };
  }
  if (result === 'limit-reached') {
    return {
      action: 'errors',
      errors: { name: `You can connect at most ${mcp.maxServers} servers.` },
    };
  }
  // TODO(slopradar): review: performance | Chat SDK awaits onModalSubmit handlers before answering Slack (chat dist/index.js processModalSubmit, then the slack adapter builds the Response), and publishHome does DB reads plus a GitHub token refresh and /user/installations call, so the 3 s view_submission window the next comment guards against is spent here first | do not await publishHome in submit handlers: fire it with a why-comment, as probe() already is
  await publishHome(userId);

  // The connection probe can outlast Slack's 3 second modal-submit ack window.
  const server = parsed.data;
  const probe = async () => {
    if (!server.token && (await advertisesOAuth(server.url))) {
      await setMCPOAuthStatus({
        error: null,
        name: server.name,
        status: 'disconnected',
        userId,
      });
      return;
    }
    await setMCPServerError({
      userId,
      name: server.name,
      ...(await probeMCPConnection({ userId, server })),
    });
  };
  probe()
    .then(() => publishHome(userId))
    .catch((error: unknown) => {
      logger.debug('[mcp] background connection probe failed', {
        error,
        name: server.name,
        userId,
      });
    });
}

export function registerMCPServers({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = Chat.getSingleton();

  bot.onAction(ids.add, async (event) => {
    const servers = await listMCPServers(event.user.userId);
    // TODO(slopradar): review: correctness | at the limit the Add click silently does nothing while the Home tab still shows Add | hide Add at the limit in blocks.ts, or tell the user; insertMCPServer already enforces the cap
    if (servers.length >= mcp.maxServers) {
      return;
    }
    await event.openModal(
      Modal({
        callbackId: ids.modal,
        title: 'Add MCP Server',
        submitLabel: 'Add',
        children: [
          TextInput({
            id: 'name',
            label: 'Name',
            placeholder: 'notion',
            maxLength: 60,
          }),
          TextInput({
            id: 'url',
            label: 'Server URL',
            placeholder: 'https://mcp.example.com/mcp',
            maxLength: 500,
          }),
          TextInput({
            id: 'token',
            label: 'Access token',
            optional: true,
            maxLength: 2000,
          }),
        ],
      })
    );
  });

  bot.onAction(ids.remove, async (event) => {
    const name = event.value;
    if (!name) {
      return;
    }
    await revokeMCPOAuth({ name, userId: event.user.userId });
    await removeMCPServer({ name, userId: event.user.userId });
    await dropClient(event.user.userId);
    await publishHome(event.user.userId);
  });

  bot.onAction(ids.connect, () => undefined);

  bot.onAction(ids.threads, async (event) => {
    await setMCPThreads({
      // TODO(slopradar): CODING_STANDARDS: one canonical union | the 'dm' | 'threads' scope literals are spelled in mcp/blocks.ts L106/L117, here, github/views.ts L21/L28 and github/actions.ts L33, with the two radio labels copied between them | export one scope enum (and its labels) from types/ and parse event.value with it
      threads: event.value === 'threads',
      userId: event.user.userId,
    });
    await publishHome(event.user.userId);
  });

  bot.onAction(ids.disconnect, async (event) => {
    const name = event.value;
    if (!name) {
      return;
    }
    await revokeMCPOAuth({ name, userId: event.user.userId });
    await setMCPOAuthStatus({
      error: null,
      name,
      status: 'disconnected',
      userId: event.user.userId,
    });
    await dropClient(event.user.userId);
    await publishHome(event.user.userId);
  });

  bot.onAction(ids.configure, async (event) => {
    const name = event.value;
    if (!name) {
      return;
    }
    const server = (await listMCPServers(event.user.userId)).find(
      (entry) => entry.name === name
    );
    if (server) {
      await event.openModal(
        configureModal({ server, userId: event.user.userId })
      );
    }
  });

  bot.onModalSubmit(ids.configureModal, async (event) => {
    const name = mcpServerSchema.shape.name.safeParse(
      event.privateMetadata
    ).data;
    if (name) {
      await setMCPServerPermission({
        name,
        permission: toolPermissionSchema.parse(event.values.permission),
        userId: event.user.userId,
      });
    }
    // TODO(slopradar): review: performance | awaited publishHome inside a modal submit delays Slack's view_submission ack (see L83) | fire it without awaiting, with a why-comment
    await publishHome(event.user.userId);
  });

  bot.onModalSubmit(ids.modal, (event) =>
    addServer({
      publishHome,
      userId: event.user.userId,
      values: event.values,
    })
  );
}
