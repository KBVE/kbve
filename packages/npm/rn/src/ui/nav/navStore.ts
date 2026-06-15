import { useSyncExternalStore } from 'react';
import { createSignal } from '@kbve/core';

const tab = createSignal<string>('home');

export const navStore = {
	get: tab.get,
	setTab: (id: string) => tab.set(id),
	subscribe: tab.subscribe,
};

export function useTab(): string {
	return useSyncExternalStore(tab.subscribe, tab.get, tab.get);
}
