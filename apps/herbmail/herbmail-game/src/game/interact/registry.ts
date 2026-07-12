import { useSyncExternalStore } from 'react';

// Kind-agnostic [F] interaction prompt. Each interactable system (doors, stones,
// future chests/levers) registers a provider that, given the player position,
// returns its nearest eligible target + squared distance or null. refreshPrompt
// picks the single closest across all providers; triggerActive() runs it. The UI
// reads the active target's verb, so nothing here knows what a door or a rock is.
export interface InteractTarget {
	id: string;
	verb: string;
	interact: () => void;
}

export type InteractProvider = (
	px: number,
	pz: number,
) => { target: InteractTarget; dist2: number } | null;

const providers = new Set<InteractProvider>();
const listeners = new Set<() => void>();
let active: InteractTarget | null = null;

export function registerInteract(p: InteractProvider): () => void {
	providers.add(p);
	return () => providers.delete(p);
}

function emit(): void {
	for (const l of listeners) l();
}

export function refreshPrompt(px: number, pz: number): void {
	let best: InteractTarget | null = null;
	let bestD = Infinity;
	for (const p of providers) {
		const c = p(px, pz);
		if (c && c.dist2 < bestD) {
			bestD = c.dist2;
			best = c.target;
		}
	}
	const changed = (best?.id ?? null) !== (active?.id ?? null);
	active = best;
	if (changed) emit();
}

export function triggerActive(): void {
	active?.interact();
}

export function resetInteract(): void {
	active = null;
	emit();
}

function sub(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function get(): InteractTarget | null {
	return active;
}

export function useActiveInteract(): InteractTarget | null {
	return useSyncExternalStore(sub, get, get);
}
