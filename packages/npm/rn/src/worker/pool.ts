import { request as coreRequest } from '@kbve/core';
import { kvStore } from '../store/kv';
import type { WorkerPool } from './types';

// Native has no background JS thread for fetch / AsyncStorage, so the pool runs
// inline — both are already async and don't block the UI thread's frame work.
export function createWorkerPool(): WorkerPool {
	return {
		request: (url, init) =>
			coreRequest(url, {
				method: init?.method,
				headers: init?.headers,
				body: init?.body,
			}),
		fetchRaw: async (url, init) => {
			const res = await fetch(url, {
				method: init?.method ?? 'GET',
				headers: init?.headers,
				body: init?.body,
			});
			const headers: Record<string, string> = {};
			res.headers.forEach((value, key) => {
				headers[key] = value;
			});
			return {
				status: res.status,
				statusText: res.statusText,
				headers,
				body: await res.text(),
			};
		},
		cacheGet: (key) => kvStore.get(key),
		cacheSet: (key, value) => kvStore.set(key, value),
		cacheRemove: (key) => kvStore.remove(key),
		cacheKeys: () => kvStore.keys(),
		cacheClear: () => kvStore.clear(),
		terminate: () => undefined,
	};
}
