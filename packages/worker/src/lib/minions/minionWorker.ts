import * as Comlink from 'comlink';
import { MinionImpl } from './minionImplementation';

let minion: MinionImpl;

// Function to initialize the minion with an ID
function initialize(id: string) {
  minion = new MinionImpl(id);
  Comlink.expose(minion);
}

Comlink.expose({ initialize });
