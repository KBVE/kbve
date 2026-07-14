import * as Comlink from 'comlink';
import type {
	PoolRawResponse,
	PoolRequestInit,
	PoolResponse,
	WorkerPool,
} from './types';

interface PoolApi {
	request<T>(url: string, init?: PoolRequestInit): Promise<PoolResponse<T>>;
	fetchRaw(url: string, init?: PoolRequestInit): Promise<PoolRawResponse>;
	cacheGet<T>(key: string): Promise<T | null>;
	cacheSet<T>(key: string, value: T): Promise<void>;
	cacheRemove(key: string): Promise<void>;
	cacheKeys(): Promise<string[]>;
	cacheClear(): Promise<void>;
}

let shared: WorkerPool | null = null;

// Singleton: one Worker owns the Dexie/IndexedDB writes for the whole tab, so
// the worker is the sole cache writer (kvStore.web delegates here). A second
// pool would mean a second writer racing the same db.
export function createWorkerPool(): WorkerPool {
	if (shared) return shared;

	let worker: Worker | null = null;
	let api: Comlink.Remote<PoolApi> | null = null;

	const get = (): Comlink.Remote<PoolApi> => {
		if (!api) {
			worker = new Worker(new URL('./pool.worker.ts', import.meta.url), {
				type: 'module',
			});
			api = Comlink.wrap<PoolApi>(worker);
		}
		return api;
	};

	// Comlink's Remote erases the per-call generics, so the surface is cast back
	// to WorkerPool at this boundary.
	const pool = {
		request: (url: string, init?: PoolRequestInit) =>
			get().request(url, init),
		fetchRaw: (url: string, init?: PoolRequestInit) =>
			get().fetchRaw(url, init),
		cacheGet: (key: string) => get().cacheGet(key),
		cacheSet: (key: string, value: unknown) => get().cacheSet(key, value),
		cacheRemove: (key: string) => get().cacheRemove(key),
		cacheKeys: () => get().cacheKeys(),
		cacheClear: () => get().cacheClear(),
		terminate: () => {
			worker?.terminate();
			worker = null;
			api = null;
			shared = null;
		},
	};

	const result = pool as unknown as WorkerPool;
	shared = result;
	return result;
}
