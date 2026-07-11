import { useSyncExternalStore } from 'react';
import { TILE } from '../config';
import {
	DungeonWorld,
	cellAtWorld,
	PHASE_GENERATED,
	PHASE_MOUNTED,
} from './ecs';
import { streamAround } from './stream';
import { type RoomDesc } from './generate';
import { removeEntity, Transform3 } from '@kbve/laser/ecs';
import { spawnRoomProps, despawnRoomProps } from '../prop/spawn';
import { spawnRoomDoors, despawnRoomDoors, resetDoors } from '../door/doors';
import { spawnTorch } from '../prop/torch';
import {
	recordPlaced,
	clearPlaced,
	suppressAt,
	unsuppressAt,
	removePlacedNear,
} from '../prop/placed';

export const DUNGEON_SEED = 1337;
const MOUNT_HOPS = 1;

export interface ActiveRoom {
	eid: number;
	key: string;
	desc: RoomDesc;
}

let dw = new DungeonWorld(DUNGEON_SEED);
let active: ActiveRoom[] = [];
let prevMounted = new Set<number>();
let lastCx = NaN;
let lastCy = NaN;
const listeners = new Set<() => void>();
let propGen = 0;
const propListeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

function bumpProps(): void {
	propGen++;
	for (const l of propListeners) l();
}

function rebuild(cx: number, cy: number): void {
	const { mounted } = streamAround(dw, cx, cy, MOUNT_HOPS);
	const mset = new Set(mounted);
	for (const eid of dw.all()) {
		dw.setPhase(eid, mset.has(eid) ? PHASE_MOUNTED : PHASE_GENERATED);
	}

	for (const eid of mset) {
		if (!prevMounted.has(eid)) {
			spawnRoomProps(dw, eid);
			spawnRoomDoors(eid);
		}
	}
	for (const eid of prevMounted) {
		if (!mset.has(eid)) {
			despawnRoomProps(dw, eid);
			despawnRoomDoors(eid);
		}
	}
	prevMounted = mset;

	active = mounted.map((eid) => {
		const desc = dw.desc(eid) as RoomDesc;
		return { eid, key: `${desc.cx}|${desc.cy}`, desc };
	});
	emit();
	bumpProps();
}

export function updatePlayerWorld(x: number, z: number): void {
	const { cx, cy } = cellAtWorld(x, z, TILE);
	if (cx === lastCx && cy === lastCy) return;
	lastCx = cx;
	lastCy = cy;
	rebuild(cx, cy);
}

// Record a player-placed torch and, if its cell is currently mounted, spawn it
// immediately. Re-spawn on future mounts is handled by spawnRoomProps.
export function placeTorch(
	pos: [number, number, number],
	dir: [number, number, number],
): void {
	unsuppressAt(pos);
	const rec = recordPlaced(pos, dir);
	const eid = dw.roomAtCell(rec.cx, rec.cy);
	if (eid !== undefined && dw.phase(eid) === PHASE_MOUNTED) {
		spawnTorch(dw.world, eid, pos, dir, rec.id);
		bumpProps();
	}
}

// Despawn a torch entity and stop it respawning: suppress its world position
// (covers procedural room torches) and drop any player-placed record for it.
export function removeTorch(eid: number): void {
	const pos: [number, number, number] = [
		Transform3.px[eid],
		Transform3.py[eid],
		Transform3.pz[eid],
	];
	suppressAt(pos);
	removePlacedNear(pos);
	removeEntity(dw.world, eid);
	bumpProps();
}

export function resetDungeon(seed = DUNGEON_SEED): void {
	seeded = true;
	dw = new DungeonWorld(seed);
	prevMounted = new Set();
	clearPlaced();
	resetDoors();
	lastCx = NaN;
	lastCy = NaN;
	rebuild(0, 0);
	lastCx = 0;
	lastCy = 0;
}

// Lazy origin seed: deferring the first rebuild out of module-eval time avoids a
// circular-import TDZ (store <-> doors), while still seeding before the first
// render/frame reads the world.
let seeded = false;
function ensureSeeded(): void {
	if (seeded) return;
	seeded = true;
	rebuild(0, 0);
	lastCx = 0;
	lastCy = 0;
}

export function getDungeon(): DungeonWorld {
	ensureSeeded();
	return dw;
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function getSnapshot(): ActiveRoom[] {
	ensureSeeded();
	return active;
}

export function useActiveRooms(): ActiveRoom[] {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribeProps(cb: () => void): () => void {
	propListeners.add(cb);
	return () => propListeners.delete(cb);
}

function getPropGen(): number {
	return propGen;
}

export function usePropGen(): number {
	return useSyncExternalStore(subscribeProps, getPropGen, getPropGen);
}
