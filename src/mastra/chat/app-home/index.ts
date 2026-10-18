import { logger } from '../../lib/logger';
import { chat } from '../instance';
import { registerGitHub } from './github';
import { registerCustomInstructions } from './instructions';
import { registerMCPServers } from './mcp';
import { registerScheduledTasks } from './scheduled-tasks';
import { publishHome } from './view';

export function registerAppHome(): void {
  chat().onAppHomeOpened((event) =>
    publishHome(event.userId).catch((error: unknown) =>
      logger.error('[app-home] publishHome failed', { error })
    )
  );
  registerCustomInstructions({ publishHome });
  registerGitHub({ publishHome });
  registerMCPServers({ publishHome });
  registerScheduledTasks({ publishHome });
}
