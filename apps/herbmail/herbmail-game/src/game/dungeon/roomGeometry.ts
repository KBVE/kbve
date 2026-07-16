import * as THREE from 'three';
import {
	buildArches,
	buildTrims,
	buildBays,
	buildCeiling,
	buildCeilingWithHoles,
	buildOasisDomes,
	buildCornerCoves,
	buildCoves,
	buildFloor,
	buildFloorWithHoles,
	buildWalls,
	buildColumns,
} from '../geometry';
import { makeLocalGrid, type RoomDesc } from './generate';
import { chunkGeometry } from './chunkGeometry';
import { queueBVH, cancelBVH } from '../render/bvh';

export interface RoomGeoSet {
	walls: THREE.BufferGeometry[][];
	columns: THREE.BufferGeometry[][];
	floor: THREE.BufferGeometry[];
	ceiling: THREE.BufferGeometry[];
	arch: THREE.BufferGeometry[];
	trim: THREE.BufferGeometry[];
	cove: THREE.BufferGeometry[];
	corner: THREE.BufferGeometry[];
	domes: THREE.BufferGeometry[];
	bays: { frames: THREE.BufferGeometry[]; backs: THREE.BufferGeometry[] };
}

function dice(merged: THREE.BufferGeometry): THREE.BufferGeometry[] {
	const chunks = chunkGeometry(merged);
	merged.dispose();
	for (const c of chunks) queueBVH(c);
	return chunks;
}

let sharedFloor: THREE.BufferGeometry[] | null = null;
let sharedCeiling: THREE.BufferGeometry[] | null = null;

function floorGeo(desc: RoomDesc): THREE.BufferGeometry[] {
	// Pool sectors punch holes in the slab, so they can't share the singleton;
	// their floor lives in the per-signature cache and disposes with the set.
	if (desc.oases.length)
		return dice(buildFloorWithHoles(makeLocalGrid(desc)));
	if (!sharedFloor) sharedFloor = dice(buildFloor(makeLocalGrid(desc)));
	return sharedFloor;
}
function ceilingGeo(desc: RoomDesc): THREE.BufferGeometry[] {
	// Oasis sectors open the ceiling over OPEN tiles, so they can't share the
	// singleton — their ceiling lives in the per-signature cache like the floor.
	if (desc.oases.length)
		return dice(buildCeilingWithHoles(makeLocalGrid(desc)));
	if (!sharedCeiling) sharedCeiling = dice(buildCeiling(makeLocalGrid(desc)));
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
		domes: desc.oases.length ? dice(buildOasisDomes(g, desc.oases)) : [],
		bays: { frames: dice(bays.frames), backs: dice(bays.backs) },
	};
}

function drop(c: THREE.BufferGeometry): void {
	cancelBVH(c);
	c.disposeBoundsTree();
	c.dispose();
}

function disposeSet(set: RoomGeoSet): void {
	if (set.floor !== sharedFloor) for (const c of set.floor) drop(c);
	if (set.ceiling !== sharedCeiling) for (const c of set.ceiling) drop(c);
	for (const w of set.walls) for (const c of w) drop(c);
	for (const w of set.columns) for (const c of w) drop(c);
	for (const c of set.arch) drop(c);
	for (const c of set.trim) drop(c);
	for (const c of set.cove) drop(c);
	for (const c of set.corner) drop(c);
	for (const c of set.domes) drop(c);
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
