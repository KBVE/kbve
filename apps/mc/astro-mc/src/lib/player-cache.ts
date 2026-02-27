import Dexie, { type Table } from 'dexie';

interface CachedProfile {
	uuid: string;
	name: string;
	skinUrl: string | null;
	cachedAt: number;
}

interface CachedSkin {
	uuid: string;
	dataUrl: string;
	cachedAt: number;
}

class PlayerCacheDB extends Dexie {
	profiles!: Table<CachedProfile, string>;
	skins!: Table<CachedSkin, string>;

	constructor() {
		super('mc-player-cache');
		this.version(1).stores({
			profiles: 'name, uuid',
			skins: 'uuid',
		});
	}
}

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let db: PlayerCacheDB | null = null;

function getDB(): PlayerCacheDB {
	if (!db) db = new PlayerCacheDB();
	return db;
}

export async function getCachedProfile(
	name: string,
): Promise<CachedProfile | null> {
	try {
		const item = await getDB().profiles.get(name);
		if (!item || Date.now() - item.cachedAt > CACHE_TTL) return null;
		return item;
	} catch {
		return null;
	}
}

export async function setCachedProfile(
	name: string,
	uuid: string,
	skinUrl: string | null,
): Promise<void> {
	try {
		await getDB().profiles.put({
			name,
			uuid,
			skinUrl,
			cachedAt: Date.now(),
		});
	} catch {
		// IndexedDB may be unavailable (private browsing, etc.)
	}
}

export async function getCachedSkin(uuid: string): Promise<string | null> {
	try {
		const item = await getDB().skins.get(uuid);
		if (!item || Date.now() - item.cachedAt > CACHE_TTL) return null;
		return item.dataUrl;
	} catch {
		return null;
	}
}

export async function setCachedSkin(
	uuid: string,
	dataUrl: string,
): Promise<void> {
	try {
		await getDB().skins.put({ uuid, dataUrl, cachedAt: Date.now() });
	} catch {
		// IndexedDB may be unavailable
	}
}
