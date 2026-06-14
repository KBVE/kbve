import { useSyncExternalStore } from 'react';
import type { AgentStore, AgentViewModel } from '@kbve/core';

export function useAgent(store: AgentStore): AgentViewModel {
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}
