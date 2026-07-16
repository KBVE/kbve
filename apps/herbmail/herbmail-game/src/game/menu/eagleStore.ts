import { useSyncExternalStore } from 'react';

let active = false;
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

export function isEagle(): boolean {
	return active;
}

export function setEagle(next: boolean): void {
	if (next === active) return;
	active = next;
	emit();
}

export function toggleEagle(): boolean {
	setEagle(!active);
	return active;
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function useEagle(): boolean {
	return useSyncExternalStore(subscribe, isEagle, isEagle);
}
