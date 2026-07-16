import { useSyncExternalStore } from 'react';
import { PSX_DEFAULTS } from '../config';

export interface Psx {
	dpr: number;
	snap: number;
	affine: number;
	eye: number;
	fov: number;
}

let psx: Psx = { ...PSX_DEFAULTS };
const listeners = new Set<() => void>();

export function getPsx(): Psx {
	return psx;
}

export function setPsx<K extends keyof Psx>(key: K, value: Psx[K]): void {
	psx = { ...psx, [key]: value };
	for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function usePsx(): Psx {
	return useSyncExternalStore(subscribe, getPsx, getPsx);
}
