import { useSyncExternalStore } from 'react';
import { TILE, FOG } from '../config';
import {
	DungeonWorld,
	sectorAtWorld,
	PHASE_GENERATED,
	PHASE_MOUNTED,
} from './ecs';
import { SECTOR_TILES, type RoomDesc } from './generate';
import { removeEntity, resetPropsWorld, Transform3 } from '../mecs/props';
import { spawnRoomProps, despawnRoomProps } from '../prop/spawn';
import { spawnRoomDoors, despawnRoomDoors, resetDoors } from '../door/doors';
import { spawnTorch } from '../prop/torch';
import { spawnCrate } from '../prop/crate';
import { PROP_CRATE } from '../prop/kinds';
import { rebuildCrateGrid } from '../prop/crateGrid';
import {
	recordPlaced,
	clearPlaced,
	suppressAt,
	unsuppressAt,
	removePlacedNear,
} from '../prop/placed';

export const DUNGEON_SEED = 1337;

const SECTOR_SPAN = SECTOR_TILES * TILE;
const MOUNT_MARGIN = FOG.far + SECTOR_SPAN * 0.25;

let dw = new DungeonWorld(DUNGEON_SEED);
let active: ActiveRoom[] = [];
let prevMounted = new Set<number>();
let lastSx = NaN;
let lastSy = NaN;
const listeners = new Set<() => void>();
let propGen = 0;
const propListeners = new Set<() => void>();

export interface ActiveRoom {
	eid: number;
	key: string;
	desc: RoomDesc;
}

function emit(): void {
	for (const l of listeners) l();
}

function bumpProps(): void {
	rebuildCrateGrid(dw.world);
	propGen++;
	for (const l of propListeners) l();
}

function axisGap(p: number, lo: number, hi: number): number {
	if (p < lo) return lo - p;
	if (p > hi) return p - hi;
	return 0;
}

function mountedSectors(
	x: number,
	z: number,
	sx: number,
	sy: number,
): number[] {
	const out: number[] = [];
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const csx = sx + dx;
			const csy = sy + dy;
			const x0 = csx * SECTOR_SPAN;
			const z0 = csy * SECTOR_SPAN;
			const gx = axisGap(x, x0, x0 + SECTOR_SPAN);
			const gz = axisGap(z, z0, z0 + SECTOR_SPAN);
			if (dx === 0 && dy === 0) {
				out.push(dw.ensureSector(csx, csy));
				continue;
			}
			if (Math.hypot(gx, gz) <= MOUNT_MARGIN)
				out.push(dw.ensureSector(csx, csy));
		}
	}
	return out;
}

function rebuild(x: number, z: number, sx: number, sy: number): void {
	const mounted = mountedSectors(x, z, sx, sy);
	const mset = new Set(mounted);
	for (const eid of dw.all())
		dw.setPhase(eid, mset.has(eid) ? PHASE_MOUNTED : PHASE_GENERATED);

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
	const { sx, sy } = sectorAtWorld(x, z, TILE);
	if (sx === lastSx && sy === lastSy) return;
	lastSx = sx;
	lastSy = sy;
	rebuild(x, z, sx, sy);
}

export function placeTorch(
	pos: [number, number, number],
	dir: [number, number, number],
): void {
	unsuppressAt(pos);
	const rec = recordPlaced(pos, dir);
	const { sx, sy } = sectorAtWorld(pos[0], pos[2], TILE);
	const eid = dw.sectorEidAt(sx, sy);
	if (eid !== undefined && dw.phase(eid) === PHASE_MOUNTED) {
		spawnTorch(dw.world, eid, pos, dir, rec.id);
		bumpProps();
	}
}

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

export function placeCrate(pos: [number, number, number]): void {
	unsuppressAt(pos);
	recordPlaced(pos, [0, 1, 0], PROP_CRATE);
	const { sx, sy } = sectorAtWorld(pos[0], pos[2], TILE);
	const eid = dw.sectorEidAt(sx, sy);
	if (eid !== undefined && dw.phase(eid) === PHASE_MOUNTED) {
		spawnCrate(dw.world, eid, pos);
		bumpProps();
	}
}

export function breakCrate(eid: number): void {
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
	resetPropsWorld();
	dw = new DungeonWorld(seed);
	prevMounted = new Set();
	clearPlaced();
	resetDoors();
	lastSx = NaN;
	lastSy = NaN;
	rebuild(SECTOR_SPAN / 2, SECTOR_SPAN / 2, 0, 0);
	lastSx = 0;
	lastSy = 0;
}

let seeded = false;
function ensureSeeded(): void {
	if (seeded) return;
	seeded = true;
	rebuild(SECTOR_SPAN / 2, SECTOR_SPAN / 2, 0, 0);
	lastSx = 0;
	lastSy = 0;
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
