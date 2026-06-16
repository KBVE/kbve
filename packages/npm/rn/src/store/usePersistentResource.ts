import { useCallback, useEffect, useRef, useState } from 'react';
import { kvStore } from './kv';
import type { CacheEntry } from './types';

export interface PersistentResource<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	stale: boolean;
	reload: () => void;
}

export interface PersistentResourceOptions {
	ttlMs?: number;
}

export function usePersistentResource<T>(
	key: string,
	fetcher: () => Promise<T>,
	options: PersistentResourceOptions = {},
): PersistentResource<T> {
	const { ttlMs } = options;
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [stale, setStale] = useState(false);
	const alive = useRef(true);

	const run = useCallback(() => {
		setError(null);
		let hadCache = false;

		kvStore.get<CacheEntry<T>>(key).then((cached) => {
			if (!alive.current) return;
			if (cached) {
				hadCache = true;
				setData(cached.value);
				setLoading(false);
				setStale(ttlMs ? Date.now() - cached.storedAt > ttlMs : false);
			}

			fetcher()
				.then((fresh) => {
					if (!alive.current) return;
					setData(fresh);
					setStale(false);
					void kvStore.set(key, {
						value: fresh,
						storedAt: Date.now(),
					});
				})
				.catch((e: unknown) => {
					if (alive.current && !hadCache) {
						setError(
							e instanceof Error ? e.message : 'Request failed',
						);
					}
				})
				.finally(() => {
					if (alive.current) setLoading(false);
				});
		});
	}, [key, ttlMs]);

	useEffect(() => {
		alive.current = true;
		run();
		return () => {
			alive.current = false;
		};
	}, [run]);

	return { data, loading, error, stale, reload: run };
}
