import * as THREE from 'three';
import {
	buildArches,
	buildBays,
	buildCeiling,
	buildCornerCoves,
	buildCoves,
	buildFloor,
	buildWalls,
	type BayGeometry,
} from '../geometry';
import { makeLocalGrid, type RoomDesc } from './generate';

export interface RoomGeoSet {
	walls: THREE.BufferGeometry[];
	floor: THREE.BufferGeometry;
	ceiling: THREE.BufferGeometry;
	arch: THREE.BufferGeometry;
	cove: THREE.BufferGeometry;
	corner: THREE.BufferGeometry;
	bays: BayGeometry;
}

// Floor + ceiling are identical for every room (they only depend on cell dims),
// so build them once and share the same buffers across all rooms.
let sharedFloor: THREE.BufferGeometry | null = null;
let sharedCeiling: THREE.BufferGeometry | null = null;

function floorGeo(desc: RoomDesc): THREE.BufferGeometry {
	if (!sharedFloor) sharedFloor = buildFloor(makeLocalGrid(desc));
	return sharedFloor;
}
function ceilingGeo(desc: RoomDesc): THREE.BufferGeometry {
	if (!sharedCeiling) sharedCeiling = buildCeiling(makeLocalGrid(desc));
	return sharedCeiling;
}

function buildSet(desc: RoomDesc): RoomGeoSet {
	const g = makeLocalGrid(desc);
	const v = desc.variant;
	return {
		walls: buildWalls(g, v),
		floor: floorGeo(desc),
		ceiling: ceilingGeo(desc),
		arch: buildArches(g, v),
		cove: buildCoves(g),
		corner: buildCornerCoves(g, v),
		bays: buildBays(g, v),
	};
}

function disposeSet(set: RoomGeoSet): void {
	for (const w of set.walls) w.dispose();
	set.arch.dispose();
	set.cove.dispose();
	set.corner.dispose();
	set.bays.frames.dispose();
	set.bays.backs.dispose();
	// floor/ceiling are shared singletons — never disposed here.
}

// Signature cache = the geometry pool. Rooms sharing a signature
// (doors:variant) reuse the exact same BufferGeometry objects — built once,
// uploaded to the GPU once, positioned per-room via a group transform. At most
// 16 doors x VARIANTS signatures exist; the LRU cap is a safety backstop.
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
