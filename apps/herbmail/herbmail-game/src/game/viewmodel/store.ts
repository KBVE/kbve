import { useSyncExternalStore } from 'react';
import { LOADOUT } from './equipment';

let equippedId = LOADOUT[0].id;
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

export function setEquipped(id: string) {
	if (id === equippedId) return;
	equippedId = id;
	emit();
}

export function cycleEquipped(dir: number) {
	const i = LOADOUT.findIndex((e) => e.id === equippedId);
	const n = (i + dir + LOADOUT.length) % LOADOUT.length;
	setEquipped(LOADOUT[n].id);
}

export function getEquippedId() {
	return equippedId;
}

let offhandId = 'empty';

export function setOffhand(id: string) {
	if (id === offhandId) return;
	offhandId = id;
	emit();
}

export function getOffhand() {
	return offhandId;
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function useEquippedId() {
	return useSyncExternalStore(subscribe, getEquippedId, getEquippedId);
}

export function useOffhand() {
	return useSyncExternalStore(subscribe, getOffhand, getOffhand);
}
