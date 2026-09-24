import { Chat } from 'chat';
import { logger } from '../../lib/logger';
import { registerGitHub } from './github';
import { registerCustomInstructions } from './instructions';
import { registerMCPServers } from './mcp';
import { registerScheduledTasks } from './scheduled-tasks';
import { registerToolDisplay } from './tool-display';
import { publishHome } from './view';

export function registerAppHome(): void {
  Chat.getSingleton().onAppHomeOpened((event) =>
    publishHome(event.userId).catch((error: unknown) =>
      logger.error('[app-home] publishHome failed', { error })
    )
  );
  registerCustomInstructions({ publishHome });
  registerGitHub({ publishHome });
  registerMCPServers({ publishHome });
  registerScheduledTasks({ publishHome });
  registerToolDisplay({ publishHome });
}
