import { CacheDB, type CacheRecord } from './cache-db';

interface CacheBackend {
	name: string;
	get(key: string): Promise<CacheRecord | null>;
	set(rec: CacheRecord): Promise<void>;
	del(key: string): Promise<void>;
}

const WORKER_PROBE_TIMEOUT_MS = 1500;
const WORKER_OP_TIMEOUT_MS = 4000;

function sharedWorkerBackend(): CacheBackend | null {
	if (typeof window === 'undefined' || !('SharedWorker' in window))
		return null;

	let port: MessagePort;
	try {
		const worker = new SharedWorker(
			new URL('../workers/supabase.shared.ts', import.meta.url),
			{ type: 'module' },
		);
		port = worker.port;
	} catch {
		return null;
	}

	const pending = new Map<
		string,
		{ resolve: (v: any) => void; reject: (e: any) => void }
	>();

	port.onmessage = (e) => {
		const { id, ok, data, error } = e.data ?? {};
		if (!id || !pending.has(id)) return;
		const { resolve, reject } = pending.get(id)!;
		pending.delete(id);
		ok ? resolve(data) : reject(new Error(error));
	};
	port.start();

	const send = <T>(
		type: string,
		payload: any,
		timeoutMs: number,
	): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			const id = crypto.randomUUID();
			const timer = setTimeout(() => {
				if (pending.delete(id)) reject(new Error('worker timeout'));
			}, timeoutMs);
			pending.set(id, {
				resolve: (v) => {
					clearTimeout(timer);
					resolve(v);
				},
				reject: (e) => {
					clearTimeout(timer);
					reject(e);
				},
			});
			port.postMessage({ id, type, payload });
		});

	return {
		name: 'sharedworker',
		async get(key) {
			return send<CacheRecord | null>(
				'cache.get',
				{ key },
				WORKER_OP_TIMEOUT_MS,
			);
		},
		async set(rec) {
			await send('cache.set', rec, WORKER_OP_TIMEOUT_MS);
		},
		async del(key) {
			await send('cache.del', { key }, WORKER_OP_TIMEOUT_MS);
		},
	};
}

function dexieBackend(): CacheBackend | null {
	if (typeof indexedDB === 'undefined') return null;
	let db: CacheDB | null = null;
	const ensure = (): CacheDB => {
		if (!db) db = new CacheDB();
		return db;
	};
	return {
		name: 'dexie',
		async get(key) {
			return (await ensure().cache.get(key)) ?? null;
		},
		async set(rec) {
			await ensure().cache.put(rec);
		},
		async del(key) {
			await ensure().cache.delete(key);
		},
	};
}

function localStorageBackend(): CacheBackend | null {
	if (typeof localStorage === 'undefined') return null;
	const k = (key: string) => `idbc:${key}`;
	return {
		name: 'localstorage',
		async get(key) {
			const raw = localStorage.getItem(k(key));
			return raw ? (JSON.parse(raw) as CacheRecord) : null;
		},
		async set(rec) {
			try {
				localStorage.setItem(k(rec.key), JSON.stringify(rec));
			} catch {
				/* quota — skip */
			}
		},
		async del(key) {
			localStorage.removeItem(k(key));
		},
	};
}

function memoryBackend(): CacheBackend {
	const mem = new Map<string, CacheRecord>();
	return {
		name: 'memory',
		async get(key) {
			return mem.get(key) ?? null;
		},
		async set(rec) {
			mem.set(rec.key, rec);
		},
		async del(key) {
			mem.delete(key);
		},
	};
}

async function probe(backend: CacheBackend): Promise<boolean> {
	try {
		await Promise.race([
			backend.get('__probe__'),
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error('probe timeout')),
					WORKER_PROBE_TIMEOUT_MS,
				),
			),
		]);
		return true;
	} catch {
		return false;
	}
}

let _backend: Promise<CacheBackend> | null = null;

async function pickBackend(): Promise<CacheBackend> {
	const sw = sharedWorkerBackend();
	if (sw && (await probe(sw))) return sw;

	const dx = dexieBackend();
	if (dx && (await probe(dx))) return dx;

	const ls = localStorageBackend();
	if (ls) return ls;

	return memoryBackend();
}

function backend(): Promise<CacheBackend> {
	if (!_backend) _backend = pickBackend();
	return _backend;
}

export async function cacheGet<T>(
	key: string,
	ttlMs: number,
): Promise<T | null> {
	try {
		const b = await backend();
		const rec = await b.get(key);
		if (!rec) return null;
		if (Date.now() - rec.ts > ttlMs) {
			void b.del(key).catch(() => {});
			return null;
		}
		return JSON.parse(rec.value) as T;
	} catch {
		return null;
	}
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
	try {
		const b = await backend();
		await b.set({ key, value: JSON.stringify(value), ts: Date.now() });
	} catch {
		/* best-effort cache */
	}
}

export async function cacheDel(key: string): Promise<void> {
	try {
		const b = await backend();
		await b.del(key);
	} catch {
		/* ignore */
	}
}

export async function cacheBackendName(): Promise<string> {
	return (await backend()).name;
}
