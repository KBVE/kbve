// wardenSingleton.ts
import * as Comlink from 'comlink';
import Warden from './warden';
import { type Warden } from './types';

let wardenProxy: Comlink.Remote<typeof Warden> | null = null;

export async function getWardenInstance(): Promise<Comlink.Remote<typeof Warden>> {
    if (!wardenProxy) {
        const wardenWorker = new Worker(new URL('./warden.ts', import.meta.url), { type: 'module' });
        wardenProxy = Comlink.wrap(wardenWorker);
    }
    return wardenProxy;
}
