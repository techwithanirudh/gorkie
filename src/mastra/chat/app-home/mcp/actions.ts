import {
  listMCPServers,
  removeMCPServer,
  setMCPServerPermission,
  upsertMCPServer,
} from '../../../db/queries/mcps';
import { GITHUB_SERVER_NAME, isGitHubUrl } from '../../../lib/github';
import { findMCPUrlError } from '../../../mcp/security';
import { findMCPConnectionError } from '../../../mcp/user-servers';
import { mcpServerSchema } from '../../../types';
import { chat } from '../../instance';
import { ids, MAX_SERVERS } from './ids';
import { decodePreset } from './presets';
import { addServerModal, configureModal } from './views';

type PublishHome = (userId: string) => Promise<void>;

async function openServerAction({
  actionId,
  openModal,
  publishHome,
  userId,
}: {
  actionId: string;
  openModal: (modal: ReturnType<typeof configureModal>) => Promise<unknown>;
  publishHome: PublishHome;
  userId: string;
}): Promise<void> {
  const [action, name] = actionId.split(' ');
  if (!name) {
    return;
  }
  if (action === ids.remove) {
    await removeMCPServer({ name, userId });
    await publishHome(userId);
    return;
  }
  if (action !== ids.configure) {
    return;
  }
  const server = (await listMCPServers(userId)).find(
    (entry) => entry.name === name
  );
  if (server) {
    await openModal(configureModal({ server, userId }));
  }
}

async function addServer({
  publishHome,
  userId,
  values,
}: {
  publishHome: PublishHome;
  userId: string;
  values: Record<string, string | undefined>;
}) {
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

  const isGitHub = isGitHubUrl(parsed.data.url);
  if (isGitHub || parsed.data.name.toLowerCase() === GITHUB_SERVER_NAME) {
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
  const connectionError = await findMCPConnectionError({
    userId,
    server: parsed.data,
  });
  if (connectionError) {
    return { action: 'errors' as const, errors: { url: connectionError } };
  }
  const result = await upsertMCPServer({
    userId,
    server: parsed.data,
    maxServers: MAX_SERVERS,
  });
  if (result === 'limit-reached') {
    return {
      action: 'errors' as const,
      errors: { name: `You can connect at most ${MAX_SERVERS} servers.` },
    };
  }
  await publishHome(userId);
}

export function registerMCPServers({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = chat();

  bot.onAction(ids.add, async (event) => {
    const servers = await listMCPServers(event.user.userId);
    if (servers.length >= MAX_SERVERS) {
      return;
    }
    await event.openModal(addServerModal());
  });

  bot.onAction((event) =>
    openServerAction({
      actionId: event.actionId,
      openModal: (modal) => event.openModal(modal),
      publishHome,
      userId: event.user.userId,
    })
  );

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
