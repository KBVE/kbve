import * as Comlink from 'comlink';
import { WardenImpl } from './wardenImplementation';

let wardenProxy: Comlink.Remote<WardenImpl> | null = null;

export async function getWardenInstance(): Promise<Comlink.Remote<WardenImpl>> {
    if (!wardenProxy) {
        const wardenWorker = new Worker(new URL('./wardenWorker.ts', import.meta.url), { type: 'module' });
        wardenProxy = Comlink.wrap<Comlink.Remote<WardenImpl>>(wardenWorker);
    }
    return wardenProxy;
}
