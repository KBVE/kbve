import * as THREE from 'three';
import {
	buildArches,
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

// Each category is a flat list of per-chunk geometries (see chunkGeometry): the
// merged sector mesh is diced into a grid so offscreen chunks frustum-cull out.
export interface RoomGeoSet {
	walls: THREE.BufferGeometry[][];
	columns: THREE.BufferGeometry[][];
	floor: THREE.BufferGeometry[];
	ceiling: THREE.BufferGeometry[];
	arch: THREE.BufferGeometry[];
	cove: THREE.BufferGeometry[];
	corner: THREE.BufferGeometry[];
	bays: { frames: THREE.BufferGeometry[]; backs: THREE.BufferGeometry[] };
}

// Chunk a freshly-built merged geometry, then free the merged original — only the
// diced chunks stay resident.
function dice(merged: THREE.BufferGeometry): THREE.BufferGeometry[] {
	const chunks = chunkGeometry(merged);
	merged.dispose();
	return chunks;
}

// Floor + ceiling are flat horizontal planes: chunking them is wasted draw calls
// (no overdraw to cull, always in view). Keep each as ONE shared mesh, built once
// and reused across every sector via the group transform.
let sharedFloor: THREE.BufferGeometry[] | null = null;
let sharedCeiling: THREE.BufferGeometry[] | null = null;

function floorGeo(desc: RoomDesc): THREE.BufferGeometry[] {
	if (!sharedFloor) sharedFloor = [buildFloor(makeLocalGrid(desc))];
	return sharedFloor;
}
function ceilingGeo(desc: RoomDesc): THREE.BufferGeometry[] {
	if (!sharedCeiling) sharedCeiling = [buildCeiling(makeLocalGrid(desc))];
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
		cove: dice(buildCoves(g)),
		corner: dice(buildCornerCoves(g, v)),
		bays: { frames: dice(bays.frames), backs: dice(bays.backs) },
	};
}

function disposeSet(set: RoomGeoSet): void {
	for (const w of set.walls) for (const c of w) c.dispose();
	for (const w of set.columns) for (const c of w) c.dispose();
	for (const c of set.arch) c.dispose();
	for (const c of set.cove) c.dispose();
	for (const c of set.corner) c.dispose();
	for (const c of set.bays.frames) c.dispose();
	for (const c of set.bays.backs) c.dispose();
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
