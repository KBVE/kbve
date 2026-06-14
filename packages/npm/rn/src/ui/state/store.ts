import { useSyncExternalStore } from 'react';

export interface UiStore<S> {
	get: () => S;
	set: (next: S | ((prev: S) => S)) => void;
	subscribe: (listener: () => void) => () => void;
}

export function createUiStore<S>(initial: S): UiStore<S> {
	let state = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => state,
		set: (next) => {
			state =
				typeof next === 'function'
					? (next as (prev: S) => S)(state)
					: next;
			listeners.forEach((listener) => listener());
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export function useStore<S, T>(
	store: UiStore<S>,
	selector: (state: S) => T,
): T {
	return useSyncExternalStore(
		store.subscribe,
		() => selector(store.get()),
		() => selector(store.get()),
	);
}
