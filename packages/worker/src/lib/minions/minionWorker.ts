import { MinionImpl } from './minionImplementation';
import * as Comlink from 'comlink';

Comlink.expose({
  createMinion: (id: string) => new MinionImpl(id),
});
