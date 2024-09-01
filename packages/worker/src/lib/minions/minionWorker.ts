import * as Comlink from 'comlink';
import { MinionImpl } from './minionImplementation';

// Directly expose a function that returns a new MinionImpl instance
Comlink.expose({
  createMinion: (id: string) => new MinionImpl(id)
});
