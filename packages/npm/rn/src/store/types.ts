export interface KVStore {
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T): Promise<void>;
	remove(key: string): Promise<void>;
	keys(): Promise<string[]>;
	clear(): Promise<void>;
}

export interface CacheEntry<T> {
	value: T;
	storedAt: number;
}
