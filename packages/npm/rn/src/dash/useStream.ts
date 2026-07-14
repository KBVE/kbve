import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import type { StreamState, StreamStore } from './types';

/** Subscribe to the full stream snapshot. */
export function useStream<TItem>(
	store: StreamStore<TItem>,
): StreamState<TItem> {
	return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Narrow subscription: re-render only when the selected slice changes. */
export function useStreamSelector<TItem, T>(
	store: StreamStore<TItem>,
	selector: (state: StreamState<TItem>) => T,
): T {
	return useSyncExternalStore(
		store.subscribe,
		() => selector(store.get()),
		() => selector(store.get()),
	);
}

/** Start polling on mount, stop on unmount. */
export function useStreamLifecycle<TItem>(store: StreamStore<TItem>): void {
	useEffect(() => {
		store.start();
		return () => store.stop();
	}, [store]);
}
