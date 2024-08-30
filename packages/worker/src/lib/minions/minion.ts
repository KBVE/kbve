import * as Comlink from 'comlink';
import { MinionImpl } from './minionImplementation';

export function createMinion(id: string) {
  const workerUrl = new URL('./minionWorker.ts', import.meta.url);
  const minionWorker = new Worker(workerUrl, { type: 'module' });
  return Comlink.wrap<Comlink.Remote<MinionImpl>>(minionWorker);
}
