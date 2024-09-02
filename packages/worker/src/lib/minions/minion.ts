import * as Comlink from 'comlink';
import { Minion } from '../types';

export async function createMinion(id: string): Promise<Comlink.Remote<Minion>> {
  const workerUrl = new URL('./minionWorker.ts', import.meta.url);
  const minionWorker = new Worker(workerUrl, { type: 'module' });

  // Initialize the Minion in the worker
  const minionProxy = Comlink.wrap<Comlink.Remote<{ initialize: (id: string) => void }>>(minionWorker);

  // Pass the ID to the Minion Worker for initialization
  await minionProxy.initialize(id);

  // Return the fully initialized Minion proxy
  return minionProxy as unknown as Comlink.Remote<Minion>;
}
