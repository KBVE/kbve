import { useSyncExternalStore } from 'react';
import type { Signal } from '@kbve/core';

export function useSignal<T>(signal: Signal<T>): T {
	return useSyncExternalStore(signal.subscribe, signal.get, signal.get);
}
