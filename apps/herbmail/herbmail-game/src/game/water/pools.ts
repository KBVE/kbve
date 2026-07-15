import { useSyncExternalStore } from 'react';
import { TILE } from '../config';
import { SURFACE_DROP } from './constants';
import {
	addComponent,
	addEntity,
	createWorld,
	despawnWhere,
	registerOwner,
	Pool,
	Transform3,
} from '../mecs/props';
import type { RoomDesc } from '../dungeon/generate';

// Pools are ECS entities (Transform3 = center, Pool = extents/surface/owner),
// spawned per sector mount beside props/doors. The PoolDef map below is a
// derived render cache: one stable object per entity lifetime, so React
// consumers keep GPU resources keyed on identity.
const world = createWorld();

export interface PoolDef {
	eid: number;
	id: string;
	cx: number;
	cz: number;
	halfW: number;
	halfL: number;
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

const defs = new Map<number, PoolDef>();
const disturbs = new Map<string, Disturb[]>();
const listeners = new Set<() => void>();
let snapshot: PoolDef[] = [];

function emit(): void {
	snapshot = [...defs.values()];
	if (import.meta.env.DEV)
		(globalThis as Record<string, unknown>).__pools = snapshot;
	for (const l of listeners) l();
}

export function spawnRoomPools(desc: RoomDesc, ownerEid: number): void {
	let changed = false;
	for (const p of desc.pools) {
		const x0 = (desc.originCol + p.col) * TILE;
		const z0 = (desc.originRow + p.row) * TILE;
		const w = p.w * TILE;
		const l = p.h * TILE;
		const eid = addEntity(world);
		addComponent(world, eid, Transform3);
		addComponent(world, eid, Pool);
		Transform3.px[eid] = x0 + w / 2;
		Transform3.py[eid] = -SURFACE_DROP;
		Transform3.pz[eid] = z0 + l / 2;
		Pool.halfW[eid] = w / 2;
		Pool.halfL[eid] = l / 2;
		Pool.surfaceY[eid] = -SURFACE_DROP;
		Pool.ownerEid[eid] = ownerEid;
		registerOwner(eid, ownerEid);
		defs.set(eid, {
			eid,
			id: `${x0}|${z0}`,
			cx: x0 + w / 2,
			cz: z0 + l / 2,
			halfW: w / 2,
			halfL: l / 2,
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

export function despawnRoomPools(ownerEid: number): void {
	let changed = false;
	for (const [eid, d] of defs) {
		if (Pool.ownerEid[eid] !== ownerEid) continue;
		defs.delete(eid);
		disturbs.delete(d.id);
		changed = true;
	}
	despawnWhere(world, Pool, 'ownerEid', ownerEid);
	if (changed) emit();
}

export function resetPools(): void {
	// resetPropsWorld() already wiped the ECS world; drop the caches.
	defs.clear();
	disturbs.clear();
	emit();
}

export function poolAt(x: number, z: number): PoolDef | null {
	for (const p of defs.values())
		if (x >= p.x0 && x < p.x1 && z >= p.z0 && z < p.z1) return p;
	return null;
}

export function nearestPool(x: number, z: number): PoolDef | null {
	let best: PoolDef | null = null;
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

function get(): PoolDef[] {
	return snapshot;
}

export function usePools(): PoolDef[] {
	return useSyncExternalStore(sub, get, get);
}
