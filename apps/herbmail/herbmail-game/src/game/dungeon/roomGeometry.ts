import * as THREE from 'three';
import {
	buildArches,
	buildTrims,
	buildBays,
	buildCeiling,
	buildCornerCoves,
	buildCoves,
	buildFloor,
	buildWalls,
	buildColumns,
} from '../geometry';
import { makeLocalGrid, type RoomDesc } from './generate';
import { chunkGeometry } from './chunkGeometry';

export interface RoomGeoSet {
	walls: THREE.BufferGeometry[][];
	columns: THREE.BufferGeometry[][];
	floor: THREE.BufferGeometry[];
	ceiling: THREE.BufferGeometry[];
	arch: THREE.BufferGeometry[];
	trim: THREE.BufferGeometry[];
	cove: THREE.BufferGeometry[];
	corner: THREE.BufferGeometry[];
	bays: { frames: THREE.BufferGeometry[]; backs: THREE.BufferGeometry[] };
}

function dice(merged: THREE.BufferGeometry): THREE.BufferGeometry[] {
	const chunks = chunkGeometry(merged);
	merged.dispose();
	for (const c of chunks) c.computeBoundsTree();
	return chunks;
}

let sharedFloor: THREE.BufferGeometry[] | null = null;
let sharedCeiling: THREE.BufferGeometry[] | null = null;

function floorGeo(desc: RoomDesc): THREE.BufferGeometry[] {
	if (!sharedFloor) {
		sharedFloor = [buildFloor(makeLocalGrid(desc))];
		sharedFloor[0].computeBoundsTree();
	}
	return sharedFloor;
}
function ceilingGeo(desc: RoomDesc): THREE.BufferGeometry[] {
	if (!sharedCeiling) {
		sharedCeiling = [buildCeiling(makeLocalGrid(desc))];
		sharedCeiling[0].computeBoundsTree();
	}
	return sharedCeiling;
}

function buildSet(desc: RoomDesc): RoomGeoSet {
	const g = makeLocalGrid(desc);
	const v = desc.variant;
	const bays = buildBays(g, v);
	return {
		walls: buildWalls(g, v).map(dice),
		columns: buildColumns(desc.columns).map(dice),
		floor: floorGeo(desc),
		ceiling: ceilingGeo(desc),
		arch: dice(buildArches(g, v)),
		trim: dice(buildTrims(g, v)),
		cove: dice(buildCoves(g)),
		corner: dice(buildCornerCoves(g, v)),
		bays: { frames: dice(bays.frames), backs: dice(bays.backs) },
	};
}

function drop(c: THREE.BufferGeometry): void {
	c.disposeBoundsTree();
	c.dispose();
}

function disposeSet(set: RoomGeoSet): void {
	for (const w of set.walls) for (const c of w) drop(c);
	for (const w of set.columns) for (const c of w) drop(c);
	for (const c of set.arch) drop(c);
	for (const c of set.trim) drop(c);
	for (const c of set.cove) drop(c);
	for (const c of set.corner) drop(c);
	for (const c of set.bays.frames) drop(c);
	for (const c of set.bays.backs) drop(c);
}

const CACHE_CAP = 96;
const cache = new Map<string, RoomGeoSet>();

export function getRoomGeoSet(desc: RoomDesc): RoomGeoSet {
	const key = desc.signature;
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const set = buildSet(desc);
	cache.set(key, set);
	if (cache.size > CACHE_CAP) {
		const oldest = cache.keys().next().value as string;
		const evicted = cache.get(oldest);
		cache.delete(oldest);
		if (evicted) disposeSet(evicted);
	}
	return set;
}

export function roomCacheStats(): { size: number; keys: string[] } {
	return { size: cache.size, keys: [...cache.keys()] };
}
