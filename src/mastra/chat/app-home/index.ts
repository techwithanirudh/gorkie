import { logger } from '../../lib/logger';
import { chat } from '../instance';
import { registerCustomInstructions } from './custom-instructions';
import { registerMCPServers } from './mcp-servers';
import { registerScheduledTasks } from './scheduled-tasks';
import { publishHome } from './view';

export function registerAppHome(): void {
  chat().onAppHomeOpened((event) =>
    publishHome(event.userId).catch((error: unknown) =>
      logger.error('[app-home] publishHome failed', { error })
    )
  );
  registerCustomInstructions({ publishHome });
  registerMCPServers({ publishHome });
  registerScheduledTasks({ publishHome });
}
