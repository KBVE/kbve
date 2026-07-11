import { useSyncExternalStore } from 'react';
import {
	addComponent,
	addEntity,
	removeEntity,
	Transform3,
} from '@kbve/laser/ecs';
import { ARCH } from '../geometry/grid';
import { hash01 } from '../geometry/rng';
import { TILE } from '../config';
import { Door } from './components';
import { CELL, type RoomDesc } from '../dungeon/generate';
import { getDungeon } from '../dungeon/store';

const HALF = TILE / 2;
const DOOR_KEEP = 0.5;
const DOOR_REACH = 2.8;

export interface DoorInfo {
	key: string;
	wc: number;
	wr: number;
	lc: number;
	lr: number;
	axis: 'x' | 'z';
	variant: number;
}

export function doorKey(wc: number, wr: number): string {
	return `${wc}|${wr}`;
}

// A door exists on a subset of open passages, decided by a symmetric hash over
// the unordered cell pair so both rooms agree. Owner = the smaller cell, so only
// one leaf is built per passage (the other side stays an open arch behind it).
function edgeHasDoor(ax: number, ay: number, bx: number, by: number): boolean {
	const first = ax < bx || (ax === bx && ay <= by);
	const x1 = first ? ax : bx;
	const y1 = first ? ay : by;
	const x2 = first ? bx : ax;
	const y2 = first ? by : ay;
	const seed = getDungeon().seed;
	return (
		hash01(
			seed ^ Math.imul(x1, 73856093) ^ Math.imul(x2, 83492791),
			Math.imul(y1, 19349663) ^ Math.imul(y2, 2654435761),
			7,
		) < DOOR_KEEP
	);
}

function ownsEdge(cx: number, cy: number, nx: number, ny: number): boolean {
	return cx < nx || (cx === nx && cy < ny);
}

// Door for a local arch tile, or null if that arch has no owned door leaf.
export function doorAtLocal(
	desc: RoomDesc,
	lc: number,
	lr: number,
): DoorInfo | null {
	if (desc.tiles[lr * CELL + lc] !== ARCH) return null;
	let dc = 0;
	let dr = 0;
	if (lr === 0) dr = -1;
	else if (lr === CELL - 1) dr = 1;
	else if (lc === 0) dc = -1;
	else if (lc === CELL - 1) dc = 1;
	else return null;

	const ncx = desc.cx + dc;
	const ncy = desc.cy + dr;
	if (!edgeHasDoor(desc.cx, desc.cy, ncx, ncy)) return null;
	if (!ownsEdge(desc.cx, desc.cy, ncx, ncy)) return null;

	const wc = desc.originCol + lc;
	const wr = desc.originRow + lr;
	return {
		key: doorKey(wc, wr),
		wc,
		wr,
		lc,
		lr,
		axis: lr === 0 || lr === CELL - 1 ? 'z' : 'x',
		variant: desc.variant,
	};
}

export function roomDoors(desc: RoomDesc): DoorInfo[] {
	const out: DoorInfo[] = [];
	for (let lr = 0; lr < CELL; lr++) {
		for (let lc = 0; lc < CELL; lc++) {
			const d = doorAtLocal(desc, lc, lr);
			if (d) out.push(d);
		}
	}
	return out;
}

// ECS registry: doorKey -> entity, plus per-room keys for despawn. State lives on
// the Door component; `unlocked` persists across room streaming so a door you
// opened stays open when its room re-mounts.
const byKey = new Map<string, number>();
const roomKeys = new Map<number, string[]>();
const unlocked = new Set<string>();

export function spawnRoomDoors(roomEid: number): void {
	const dw = getDungeon();
	const desc = dw.desc(roomEid);
	if (!desc) return;
	const world = dw.world;
	const keys: string[] = [];
	for (const d of roomDoors(desc)) {
		const eid = addEntity(world);
		addComponent(world, eid, Transform3);
		addComponent(world, eid, Door);
		Transform3.px[eid] = d.wc * TILE + HALF;
		Transform3.py[eid] = 0;
		Transform3.pz[eid] = d.wr * TILE + HALF;
		const isLocked = unlocked.has(d.key) ? 0 : 1;
		Door.locked[eid] = isLocked;
		Door.open[eid] = isLocked ? 0 : 1;
		Door.lc[eid] = d.lc;
		Door.lr[eid] = d.lr;
		Door.variant[eid] = d.variant;
		Door.axis[eid] = d.axis === 'x' ? 1 : 0;
		byKey.set(d.key, eid);
		keys.push(d.key);
	}
	roomKeys.set(roomEid, keys);
}

export function despawnRoomDoors(roomEid: number): void {
	const world = getDungeon().world;
	const keys = roomKeys.get(roomEid);
	if (!keys) return;
	for (const key of keys) {
		const eid = byKey.get(key);
		if (eid !== undefined) removeEntity(world, eid);
		byKey.delete(key);
	}
	roomKeys.delete(roomEid);
}

export function doorEid(key: string): number | undefined {
	return byKey.get(key);
}

// Locked (or not-yet-spawned) reads as blocking; collision uses this.
export function isDoorLocked(key: string): boolean {
	const eid = byKey.get(key);
	return eid === undefined ? true : Door.locked[eid] === 1;
}

export function resetDoors(): void {
	byKey.clear();
	roomKeys.clear();
	unlocked.clear();
	active = null;
	emitPrompt();
}

let active: string | null = null;
const promptListeners = new Set<() => void>();

function emitPrompt(): void {
	for (const l of promptListeners) l();
}

// Nearest locked door within reach of the player -> the prompt target.
export function refreshDoorPrompt(px: number, pz: number): void {
	let best: string | null = null;
	let bestD = DOOR_REACH * DOOR_REACH;
	for (const [key, eid] of byKey) {
		if (Door.locked[eid] !== 1) continue;
		const dx = Transform3.px[eid] - px;
		const dz = Transform3.pz[eid] - pz;
		const dd = dx * dx + dz * dz;
		if (dd < bestD) {
			bestD = dd;
			best = key;
		}
	}
	if (best !== active) {
		active = best;
		emitPrompt();
	}
}

export function tryOpenActiveDoor(): void {
	if (!active) return;
	const eid = byKey.get(active);
	if (eid !== undefined) Door.locked[eid] = 0;
	unlocked.add(active);
	active = null;
	emitPrompt();
}

function subPrompt(cb: () => void): () => void {
	promptListeners.add(cb);
	return () => promptListeners.delete(cb);
}

function getActive(): string | null {
	return active;
}

export function useActiveDoor(): string | null {
	return useSyncExternalStore(subPrompt, getActive, getActive);
}
