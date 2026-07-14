export interface PoolRequestInit {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface PoolResponse<T> {
	ok: boolean;
	status: number;
	data: T | null;
	error: string | null;
}

export interface PoolRawResponse {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body: string;
}

// Off-main-thread network + cache. On web these run in a persistent Comlink
// Worker (fetch parsing + IndexedDB off the render thread); on native they run
// inline (no background JS thread for fetch/AsyncStorage), same surface.
export interface WorkerPool {
	request<T = unknown>(
		url: string,
		init?: PoolRequestInit,
	): Promise<PoolResponse<T>>;
	fetchRaw(url: string, init?: PoolRequestInit): Promise<PoolRawResponse>;
	cacheGet<T = unknown>(key: string): Promise<T | null>;
	cacheSet<T = unknown>(key: string, value: T): Promise<void>;
	cacheRemove(key: string): Promise<void>;
	cacheKeys(): Promise<string[]>;
	cacheClear(): Promise<void>;
	terminate(): void;
}
