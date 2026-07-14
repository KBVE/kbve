import { useCallback, useEffect, useRef, useState } from 'react';
import type { KbveApi, RequestResult } from '@kbve/core';
import { useKbve } from './KbveProvider';

export function useApi(): KbveApi {
	return useKbve().api;
}

export function usePool() {
	return useKbve().pool;
}

export interface ApiResource<T> {
	data: T | null;
	error: string | null;
	loading: boolean;
	reload: () => void;
}

export function useApiResource<T>(
	fetcher: (api: KbveApi) => Promise<RequestResult<T>>,
	deps: ReadonlyArray<unknown> = [],
): ApiResource<T> {
	const api = useApi();
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const alive = useRef(true);

	const run = useCallback(() => {
		setLoading(true);
		setError(null);
		fetcher(api)
			.then((res) => {
				if (!alive.current) return;
				if (res.ok) {
					setData(res.data);
				} else {
					setError(res.error ?? `Request failed (${res.status})`);
				}
			})
			.catch((e: unknown) => {
				if (alive.current) {
					setError(e instanceof Error ? e.message : 'Request failed');
				}
			})
			.finally(() => {
				if (alive.current) setLoading(false);
			});
	}, [api, ...deps]);

	useEffect(() => {
		alive.current = true;
		run();
		return () => {
			alive.current = false;
		};
	}, [run]);

	return { data, error, loading, reload: run };
}
