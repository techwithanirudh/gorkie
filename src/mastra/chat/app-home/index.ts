import { Chat } from 'chat';
import { logger } from '../../lib/logger';
import { registerGitHub } from './github/actions';
import { registerCustomInstructions } from './instructions/actions';
import { registerMCPServers } from './mcp/actions';
import { registerScheduledTasks } from './scheduled-tasks/actions';
import { registerToolDisplay } from './tool-display/actions';
import { publishHome } from './view';

export function registerAppHome(): void {
  Chat.getSingleton().onAppHomeOpened((event) =>
    publishHome(event.userId).catch((error: unknown) =>
      logger.error('[app-home] publishHome failed', { error })
    )
  );
  registerCustomInstructions();
  registerGitHub();
  registerMCPServers();
  registerScheduledTasks();
  registerToolDisplay();
}
