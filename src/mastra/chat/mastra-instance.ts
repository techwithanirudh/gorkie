import type { Mastra } from '@mastra/core/mastra';

let instance: Mastra | undefined;

export function setMastra(mastra: Mastra): void {
  instance = mastra;
}

export function getMastra(): Mastra {
  if (!instance) {
    throw new Error('Mastra is not initialized yet.');
  }
  return instance;
}
