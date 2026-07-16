import { useSyncExternalStore } from 'react';
import { TILE } from '../config';
import { SURFACE_DROP } from './constants';
import {
	addComponent,
	addEntity,
	createWorld,
	despawnWhere,
	registerOwner,
	Oasis,
	Transform3,
} from '../mecs/props';
import type { RoomDesc } from '../dungeon/generate';

const world = createWorld();

export interface OasisDef {
	eid: number;
	id: string;
	cx: number;
	cz: number;
	halfW: number;
	halfL: number;
	roomHalfMin: number;
	surfaceY: number;
	x0: number;
	x1: number;
	z0: number;
	z1: number;
}

export type Disturb =
	| { kind: 'drop'; x: number; z: number; radius: number; strength: number }
	| {
			kind: 'sphere';
			ox: number;
			oz: number;
			nx: number;
			nz: number;
			y: number;
			radius: number;
	  };

const defs = new Map<number, OasisDef>();
const disturbs = new Map<string, Disturb[]>();
const listeners = new Set<() => void>();
let snapshot: OasisDef[] = [];

function emit(): void {
	snapshot = [...defs.values()];
	if (import.meta.env.DEV)
		(globalThis as Record<string, unknown>).__oases = snapshot;
	for (const l of listeners) l();
}

export function spawnRoomOases(desc: RoomDesc, ownerEid: number): void {
	let changed = false;
	for (const p of desc.oases) {
		const x0 = (desc.originCol + p.col) * TILE;
		const z0 = (desc.originRow + p.row) * TILE;
		const w = p.w * TILE;
		const l = p.h * TILE;
		const eid = addEntity(world);
		addComponent(world, eid, Transform3);
		addComponent(world, eid, Oasis);
		Transform3.px[eid] = x0 + w / 2;
		Transform3.py[eid] = -SURFACE_DROP;
		Transform3.pz[eid] = z0 + l / 2;
		Oasis.halfW[eid] = w / 2;
		Oasis.halfL[eid] = l / 2;
		Oasis.surfaceY[eid] = -SURFACE_DROP;
		Oasis.ownerEid[eid] = ownerEid;
		registerOwner(eid, ownerEid);
		defs.set(eid, {
			eid,
			id: `${x0}|${z0}`,
			cx: x0 + w / 2,
			cz: z0 + l / 2,
			halfW: w / 2,
			halfL: l / 2,
			roomHalfMin: (Math.min(p.rw, p.rh) * TILE) / 2,
			surfaceY: -SURFACE_DROP,
			x0,
			x1: x0 + w,
			z0,
			z1: z0 + l,
		});
		changed = true;
	}
	if (changed) emit();
}

export function despawnRoomOases(ownerEid: number): void {
	let changed = false;
	for (const [eid, d] of defs) {
		if (Oasis.ownerEid[eid] !== ownerEid) continue;
		defs.delete(eid);
		disturbs.delete(d.id);
		changed = true;
	}
	despawnWhere(world, Oasis, 'ownerEid', ownerEid);
	if (changed) emit();
}

export function resetOases(): void {
	defs.clear();
	disturbs.clear();
	emit();
}

export function oasisAt(x: number, z: number): OasisDef | null {
	for (const p of defs.values())
		if (x >= p.x0 && x < p.x1 && z >= p.z0 && z < p.z1) return p;
	return null;
}

export function nearestOasis(x: number, z: number): OasisDef | null {
	let best: OasisDef | null = null;
	let bd = Infinity;
	for (const p of defs.values()) {
		const d = Math.hypot(p.cx - x, p.cz - z);
		if (d < bd) {
			bd = d;
			best = p;
		}
	}
	return best;
}

export function pushDisturb(id: string, d: Disturb): void {
	const q = disturbs.get(id);
	if (q) {
		if (q.length < 16) q.push(d);
	} else disturbs.set(id, [d]);
}

export function drainDisturbs(id: string): Disturb[] {
	const q = disturbs.get(id);
	if (!q || !q.length) return EMPTY;
	disturbs.set(id, []);
	return q;
}

const EMPTY: Disturb[] = [];

let submerged = false;
const subListeners = new Set<() => void>();

export function setCameraSubmerged(on: boolean): void {
	if (on === submerged) return;
	submerged = on;
	for (const l of subListeners) l();
}

export function useCameraSubmerged(): boolean {
	return useSyncExternalStore(
		(cb) => {
			subListeners.add(cb);
			return () => subListeners.delete(cb);
		},
		() => submerged,
		() => submerged,
	);
}

function sub(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function get(): OasisDef[] {
	return snapshot;
}

export function getOases(): OasisDef[] {
	return snapshot;
}

export function useOases(): OasisDef[] {
	return useSyncExternalStore(sub, get, get);
}
