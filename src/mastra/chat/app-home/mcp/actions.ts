import { Modal, TextInput } from 'chat';
import { mcp } from '../../../config';
import {
  insertMCPServer,
  listMCPServers,
  removeMCPServer,
  setMCPServerError,
  setMCPServerPermission,
} from '../../../db/queries/mcps';
import { logger } from '../../../lib/logger';
import { findMCPUrlError } from '../../../mcp/security';
import { findMCPConnectionError } from '../../../mcp/user-servers';
import { mcpServerSchema, type PublishHome } from '../../../types';
import { chat } from '../../instance';
import { ids } from './ids';
import { decodePreset } from './presets';
import { configureModal } from './views';

async function addServer({
  publishHome,
  userId,
  values,
}: {
  publishHome: PublishHome;
  userId: string;
  values: Record<string, string | undefined>;
}): Promise<{ action: 'errors'; errors: Record<string, string> } | undefined> {
  const parsed = mcpServerSchema.safeParse({
    name: values.name?.trim(),
    url: values.url?.trim(),
    token: values.token?.trim() || undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [field] = issue.path;
      if (typeof field === 'string' && !errors[field]) {
        errors[field] = issue.message;
      }
    }
    return { action: 'errors' as const, errors };
  }

  const isGitHub = new URL(parsed.data.url).host === 'api.githubcopilot.com';
  if (isGitHub || parsed.data.name.toLowerCase() === 'github') {
    const message =
      'GitHub has its own section above. Use Sign in with GitHub instead.';
    return {
      action: 'errors' as const,
      errors: isGitHub ? { url: message } : { name: message },
    };
  }
  const urlError = await findMCPUrlError(parsed.data.url);
  if (urlError) {
    return { action: 'errors' as const, errors: { url: urlError } };
  }
  const result = await insertMCPServer({
    userId,
    server: parsed.data,
    maxServers: mcp.maxServers,
  });
  if (result === 'name-taken') {
    return {
      action: 'errors' as const,
      errors: {
        name: `The name "${parsed.data.name}" is already in use. Pick another name, or remove the existing server first.`,
      },
    };
  }
  if (result === 'limit-reached') {
    return {
      action: 'errors' as const,
      errors: { name: `You can connect at most ${mcp.maxServers} servers.` },
    };
  }
  await publishHome(userId);

  // The connection probe can outlast Slack's 3 second modal-submit ack window.
  const server = parsed.data;
  findMCPConnectionError({ userId, server })
    .then(async (connectionError) => {
      await setMCPServerError({
        userId,
        name: server.name,
        error: connectionError ?? null,
      });
      await publishHome(userId);
    })
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
  const bot = chat();

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
    await removeMCPServer({ name, userId: event.user.userId });
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
    const { permission, scope } = decodePreset(event.values.permission);
    if (scope) {
      await setMCPServerPermission({
        name: scope,
        permission,
        userId: event.user.userId,
      });
    }
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
