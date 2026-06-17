import { useSyncExternalStore } from 'react';
import { createSignal } from '@kbve/core';
import type { RailEdge, RailMode, RailState } from './models';

export interface RailController {
	get: () => RailState;
	subscribe: (listener: () => void) => () => void;
	setEdge: (edge: RailEdge) => void;
	setMode: (mode: RailMode) => void;
	toggleMode: () => void;
	setExpanded: (expanded: boolean) => void;
	setPinned: (pinned: boolean) => void;
	togglePinned: () => void;
}

const DEFAULT_STATE: RailState = {
	edge: 'left',
	mode: 'docked',
	expanded: false,
	pinned: false,
};

export function createRailController(
	initial?: Partial<RailState>,
): RailController {
	const signal = createSignal<RailState>({ ...DEFAULT_STATE, ...initial });
	const patch = (next: Partial<RailState>) =>
		signal.set((prev) => ({ ...prev, ...next }));
	return {
		get: signal.get,
		subscribe: signal.subscribe,
		setEdge: (edge) => patch({ edge }),
		setMode: (mode) => patch({ mode }),
		toggleMode: () =>
			signal.set((prev) => ({
				...prev,
				mode: prev.mode === 'docked' ? 'floating' : 'docked',
			})),
		setExpanded: (expanded) =>
			signal.set((prev) => (prev.pinned ? prev : { ...prev, expanded })),
		setPinned: (pinned) => patch({ pinned, expanded: pinned }),
		togglePinned: () =>
			signal.set((prev) => ({
				...prev,
				pinned: !prev.pinned,
				expanded: !prev.pinned,
			})),
	};
}

export function useRailState(controller: RailController): RailState {
	return useSyncExternalStore(
		controller.subscribe,
		controller.get,
		controller.get,
	);
}
