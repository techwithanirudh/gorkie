import { agentTools } from './agent';
import { baseTools } from './base';

export const tools = {
  ...baseTools,
  ...agentTools,
};
