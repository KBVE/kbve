import { useSyncExternalStore } from 'react';
import { slotOf } from './equipment';
import { resolveHands, type Hands } from './hands';

let held: string[] = [];
let hands: Hands = { right: null, left: null };
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

// Equip semantics: bare hands clears everything; a light (torch) toggles so it can
// ride along with a weapon; any other item replaces whatever shared its slot while
// leaving the light untouched — so picking a sword leaves the torch in the off-hand.
export function equip(id: string) {
	const slot = slotOf(id);
	let next: string[];
	if (slot === null) {
		if (held.length === 0) return;
		next = [];
	} else if (slot === 'light') {
		next = held.includes(id) ? held.filter((h) => h !== id) : [...held, id];
	} else {
		next = held.filter((h) => h !== id && slotOf(h) !== slot);
		next.push(id);
	}
	held = next;
	hands = resolveHands(held);
	emit();
}

// Take a single held item off (back to the inventory grid via reconcileEquip).
export function unequip(id: string) {
	if (!held.includes(id)) return;
	held = held.filter((h) => h !== id);
	hands = resolveHands(held);
	emit();
}

export function getHeld() {
	return held;
}

export function isHeld(id: string) {
	return held.includes(id);
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

// Notify on any held-items change (equip/unequip/swap). Used by the inventory to
// pull equipped items out of the grid and return them when taken off.
export function subscribeHeld(cb: () => void) {
	return subscribe(cb);
}

export function useHeld() {
	return useSyncExternalStore(subscribe, getHeld, getHeld);
}

export function getHands() {
	return hands;
}

export function useHands() {
	return useSyncExternalStore(subscribe, getHands, getHands);
}

// Compat: legacy callers speak a single "equipped" id. Report the right-hand item
// (the primary/main), falling back to bare hands.
export function getEquippedId() {
	return hands.right ?? 'empty';
}

export function useEquippedId() {
	return useSyncExternalStore(subscribe, getEquippedId, getEquippedId);
}

export function setEquipped(id: string) {
	equip(id);
}
