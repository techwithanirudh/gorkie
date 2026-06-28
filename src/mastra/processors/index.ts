import { sandboxLifecycle } from './sandbox-lifecycle';
import { turnLog } from './turn-log';

// Agent output processors, in order.
export const outputProcessors = [sandboxLifecycle, turnLog];
