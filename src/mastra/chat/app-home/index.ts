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
  // TODO(slopradar): simplification: injection with one implementation | every register* takes publishHome as a param and PublishHome exists in types/ only for this, while moderation/index.ts imports publishHome directly; it only dodges the view.ts -> <section>/index -> actions import loop, which ESM tolerates for functions called at runtime | import publishHome from './view' in each actions.ts (or have view.ts import blocks.ts files directly) and delete PublishHome
  registerCustomInstructions({ publishHome });
  registerGitHub({ publishHome });
  registerMCPServers({ publishHome });
  registerScheduledTasks({ publishHome });
  registerToolDisplay({ publishHome });
}
