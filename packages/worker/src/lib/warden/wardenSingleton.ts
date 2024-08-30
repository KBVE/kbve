import * as Comlink from 'comlink';
import { Warden } from '../types';

let wardenProxy: Comlink.Remote<Warden> | null = null;

export async function getWardenInstance(): Promise<Comlink.Remote<Warden>> {
    if (!wardenProxy) {
        const wardenWorker = new Worker(new URL('./wardenWorker.ts', import.meta.url), { type: 'module' });
        wardenProxy = Comlink.wrap<Comlink.Remote<Warden>>(wardenWorker);
    }
    return wardenProxy;
}