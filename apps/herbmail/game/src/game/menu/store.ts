import { useSyncExternalStore } from 'react';

export type Screen = 'main' | 'codex' | 'settings' | 'playing';

let screen: Screen = 'main';
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

export function getScreen(): Screen {
	return screen;
}

export function setScreen(next: Screen): void {
	if (next === screen) return;
	screen = next;
	emit();
}

export function isPlaying(): boolean {
	return screen === 'playing';
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function useScreen(): Screen {
	return useSyncExternalStore(subscribe, getScreen, getScreen);
}
