import * as Comlink from 'comlink';
import { WardenImpl } from './wardenImplementation';

// Remember the purpose of this file is interact with the warden from the main thread.

export async function createWarden(): Promise<{ wardenProxy: Comlink.Remote<WardenImpl>, worker: Worker }> {
    const workerUrl = new URL('./wardenWorker.ts', import.meta.url);
    const wardenWorker = new Worker(workerUrl, { type: 'module' });
    const wardenProxy = Comlink.wrap<Comlink.Remote<WardenImpl>>(wardenWorker);

    return { wardenProxy, worker: wardenWorker };
}
