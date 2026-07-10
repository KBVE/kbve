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

export const DUNGEON_SEED = 1337;
const MOUNT_HOPS = 1;

export interface ActiveRoom {
	eid: number;
	key: string;
	desc: RoomDesc;
}

let dw = new DungeonWorld(DUNGEON_SEED);
let active: ActiveRoom[] = [];
let lastCx = NaN;
let lastCy = NaN;
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

function rebuild(cx: number, cy: number): void {
	const { mounted } = streamAround(dw, cx, cy, MOUNT_HOPS);
	const mset = new Set(mounted);
	for (const eid of dw.all()) {
		dw.setPhase(eid, mset.has(eid) ? PHASE_MOUNTED : PHASE_GENERATED);
	}
	active = mounted.map((eid) => {
		const desc = dw.desc(eid) as RoomDesc;
		return { eid, key: `${desc.cx}|${desc.cy}`, desc };
	});
	emit();
}

export function updatePlayerWorld(x: number, z: number): void {
	const { cx, cy } = cellAtWorld(x, z, TILE);
	if (cx === lastCx && cy === lastCy) return;
	lastCx = cx;
	lastCy = cy;
	rebuild(cx, cy);
}

export function resetDungeon(seed = DUNGEON_SEED): void {
	dw = new DungeonWorld(seed);
	lastCx = NaN;
	lastCy = NaN;
	rebuild(0, 0);
	lastCx = 0;
	lastCy = 0;
}

export function getDungeon(): DungeonWorld {
	return dw;
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function getSnapshot(): ActiveRoom[] {
	return active;
}

export function useActiveRooms(): ActiveRoom[] {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Seed the origin room so the first frame renders before the player moves.
rebuild(0, 0);
lastCx = 0;
lastCy = 0;
