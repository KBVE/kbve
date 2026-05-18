export type WatchEntry = {
	kind: string;
	ref: string;
};

const STORAGE_KEY = 'kbve:market:watchlist:v1';
const subscribers = new Set<() => void>();

function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function entryKey(e: WatchEntry): string {
	return `${e.kind}::${e.ref}`;
}

function readRaw(): WatchEntry[] {
	if (!isBrowser()) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const out: WatchEntry[] = [];
		const seen = new Set<string>();
		for (const e of parsed) {
			if (
				e &&
				typeof e === 'object' &&
				typeof e.kind === 'string' &&
				typeof e.ref === 'string'
			) {
				const k = entryKey(e);
				if (!seen.has(k)) {
					seen.add(k);
					out.push({ kind: e.kind, ref: e.ref });
				}
			}
		}
		return out;
	} catch {
		return [];
	}
}

function writeRaw(entries: WatchEntry[]): void {
	if (!isBrowser()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {}
}

function notify(): void {
	for (const fn of subscribers) {
		try {
			fn();
		} catch {}
	}
}

export function getWatchList(): WatchEntry[] {
	return readRaw();
}

export function isWatched(entry: WatchEntry): boolean {
	const list = readRaw();
	const k = entryKey(entry);
	return list.some((e) => entryKey(e) === k);
}

export function addToWatch(entry: WatchEntry): void {
	const list = readRaw();
	const k = entryKey(entry);
	if (list.some((e) => entryKey(e) === k)) return;
	list.push({ kind: entry.kind, ref: entry.ref });
	writeRaw(list);
	notify();
}

export function removeFromWatch(entry: WatchEntry): void {
	const list = readRaw();
	const k = entryKey(entry);
	const next = list.filter((e) => entryKey(e) !== k);
	if (next.length === list.length) return;
	writeRaw(next);
	notify();
}

export function toggleWatch(entry: WatchEntry): boolean {
	if (isWatched(entry)) {
		removeFromWatch(entry);
		return false;
	}
	addToWatch(entry);
	return true;
}

export function subscribe(fn: () => void): () => void {
	subscribers.add(fn);
	if (isBrowser()) {
		const onStorage = (ev: StorageEvent) => {
			if (ev.key === STORAGE_KEY) fn();
		};
		window.addEventListener('storage', onStorage);
		return () => {
			subscribers.delete(fn);
			window.removeEventListener('storage', onStorage);
		};
	}
	return () => {
		subscribers.delete(fn);
	};
}
