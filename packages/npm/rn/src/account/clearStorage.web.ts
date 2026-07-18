const KNOWN_IDB_NAMES = ['sb-auth-v2', 'sb-auth'];
const SYNC_CHANNEL = 'kbve-droid-sync';

function clearStorageBuckets(): void {
	try {
		localStorage.clear();
	} catch {
		void 0;
	}
	try {
		sessionStorage.clear();
	} catch {
		void 0;
	}
}

function clearCookies(): void {
	if (typeof document === 'undefined') return;
	try {
		const cookies = document.cookie ? document.cookie.split(';') : [];
		for (const cookie of cookies) {
			const name = cookie.split('=')[0]?.trim();
			if (!name) continue;
			document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
		}
	} catch {
		void 0;
	}
}

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve) => {
		try {
			const req = indexedDB.deleteDatabase(name);
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		} catch {
			resolve();
		}
	});
}

async function clearIndexedDb(): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	let names = KNOWN_IDB_NAMES;
	try {
		if (typeof indexedDB.databases === 'function') {
			const dbs = await indexedDB.databases();
			const found = dbs
				.map((d) => d.name)
				.filter((n): n is string => typeof n === 'string' && n.length > 0);
			if (found.length > 0) names = found;
		}
	} catch {
		names = KNOWN_IDB_NAMES;
	}
	await Promise.all(names.map(deleteDatabase));
}

async function clearCacheApi(): Promise<void> {
	if (typeof caches === 'undefined') return;
	try {
		const keys = await caches.keys();
		await Promise.all(keys.map((k) => caches.delete(k)));
	} catch {
		void 0;
	}
}

function notifyOtherTabs(): void {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		const channel = new BroadcastChannel(SYNC_CHANNEL);
		channel.postMessage({ type: 'profile-clear' });
		channel.close();
	} catch {
		void 0;
	}
}

export async function clearStorage(): Promise<void> {
	clearStorageBuckets();
	clearCookies();
	await clearIndexedDb();
	await clearCacheApi();
	notifyOtherTabs();
}
