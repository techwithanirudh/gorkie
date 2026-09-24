import { Chat, Modal, type ModalErrorsResponse, TextInput } from 'chat';
import { z } from 'zod';
import { mcp } from '../../../config';
import { setMCPOAuthStatus } from '../../../db/queries/mcp-oauth';
import {
  insertMCPServer,
  listMCPServers,
  removeMCPServer,
  setMCPServerError,
  setMCPServerPermission,
} from '../../../db/queries/mcps';
import { updateUserSettings } from '../../../db/queries/settings';
import { logger } from '../../../lib/logger';
import { advertisesOAuth } from '../../../mcp/errors';
import { revokeMCPOAuth } from '../../../mcp/oauth';
import { checkMCPUrl } from '../../../mcp/security';
import { dropClient } from '../../../mcp/user-servers/client';
import { probeMCPConnection } from '../../../mcp/user-servers/probe';
import { mcpServerSchema, toolPermissionSchema } from '../../../types';
import { scopeSchema } from '../presets';
import { publishHome, refreshHome } from '../view';
import { ids } from './ids';
import { configureModal } from './views';

async function addServer({
  userId,
  values,
}: {
  userId: string;
  values: Record<string, string | undefined>;
}): Promise<ModalErrorsResponse | undefined> {
  const parsed = mcpServerSchema.safeParse({
    name: values.name?.trim(),
    url: values.url?.trim(),
    token: values.token?.trim() || undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(
      z.flattenError(parsed.error).fieldErrors
    )) {
      if (messages?.[0]) {
        errors[field] = messages[0];
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
  // Both publishes and the connection probe can outlast Slack's 3 second
  // modal-submit ack window. They run in order so the probe's result lands last.
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
  publishHome(userId)
    .catch((error: unknown) => {
      logger.warn('[app-home] could not refresh the Home tab', {
        error,
        userId,
      });
    })
    .then(probe)
    .then(() => publishHome(userId))
    .catch((error: unknown) => {
      logger.debug('[mcp] background connection probe failed', {
        error,
        name: server.name,
        userId,
      });
    });
}

export function registerMCPServers(): void {
  const bot = Chat.getSingleton();

  bot.onAction(ids.add, async (event) => {
    const servers = await listMCPServers(event.user.userId);
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
    await updateUserSettings({
      set: { mcpThreads: scopeSchema.parse(event.value) === 'threads' },
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
    refreshHome(event.user.userId);
  });

  bot.onModalSubmit(ids.modal, (event) =>
    addServer({
      userId: event.user.userId,
      values: event.values,
    })
  );
}
