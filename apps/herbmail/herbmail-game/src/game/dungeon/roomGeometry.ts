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
import {
	forgetSector,
	releaseBaked,
	requestChunkBake,
	type SectorBakeCtx,
} from '../render/bake/bakePool';
import { sectorBakeCtx } from '../render/bake/sectorBakeCtx';

export interface RoomGeoSet {
	signature: string;
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

function dice(
	merged: THREE.BufferGeometry,
	ctx: SectorBakeCtx | null,
): THREE.BufferGeometry[] {
	const chunks = chunkGeometry(merged);
	merged.dispose();
	for (const c of chunks) {
		queueBVH(c);
		if (ctx) requestChunkBake(c, ctx);
	}
	return chunks;
}

let sharedFloor: THREE.BufferGeometry[] | null = null;
let sharedCeiling: THREE.BufferGeometry[] | null = null;

// A baked sector needs its own slab: the bake lives on the geometry, so the
// singleton is only reusable for sectors that opted out of baking.
function floorGeo(
	desc: RoomDesc,
	ctx: SectorBakeCtx | null,
): THREE.BufferGeometry[] {
	if (desc.oases.length)
		return dice(buildFloorWithHoles(makeLocalGrid(desc)), ctx);
	if (ctx) return dice(buildFloor(makeLocalGrid(desc)), ctx);
	if (!sharedFloor) sharedFloor = dice(buildFloor(makeLocalGrid(desc)), null);
	return sharedFloor;
}
function ceilingGeo(
	desc: RoomDesc,
	ctx: SectorBakeCtx | null,
): THREE.BufferGeometry[] {
	if (desc.oases.length)
		return dice(buildCeilingWithHoles(makeLocalGrid(desc)), ctx);
	if (ctx) return dice(buildCeiling(makeLocalGrid(desc)), ctx);
	if (!sharedCeiling)
		sharedCeiling = dice(buildCeiling(makeLocalGrid(desc)), null);
	return sharedCeiling;
}

function buildSet(desc: RoomDesc): RoomGeoSet {
	const g = makeLocalGrid(desc);
	const v = desc.variant;
	const bays = buildBays(g, v);
	const ctx = sectorBakeCtx(desc);
	return {
		signature: desc.signature,
		walls: buildWalls(g, v).map((m) => dice(m, ctx)),
		columns: buildColumns(desc.columns).map((m) => dice(m, ctx)),
		floor: floorGeo(desc, ctx),
		ceiling: ceilingGeo(desc, ctx),
		arch: dice(buildArches(g, v), ctx),
		trim: dice(buildTrims(g, v), ctx),
		cove: dice(buildCoves(g), ctx),
		corner: dice(buildCornerCoves(g, v), ctx),
		domes: desc.oases.length
			? dice(buildOasisDomes(g, desc.oases), ctx)
			: [],
		bays: {
			frames: dice(bays.frames, ctx),
			backs: dice(bays.backs, ctx),
		},
	};
}

function drop(c: THREE.BufferGeometry): void {
	cancelBVH(c);
	releaseBaked(c);
	c.disposeBoundsTree();
	c.dispose();
}

function disposeSet(set: RoomGeoSet): void {
	forgetSector(set.signature);
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

const buildMs: number[] = [];

export function geoBuildStats(): {
	builds: number;
	totalMs: number;
	worstMs: number;
	avgMs: number;
} {
	const total = buildMs.reduce((a, b) => a + b, 0);
	return {
		builds: buildMs.length,
		totalMs: +total.toFixed(1),
		worstMs: +Math.max(0, ...buildMs).toFixed(1),
		avgMs: buildMs.length ? +(total / buildMs.length).toFixed(1) : 0,
	};
}

export function resetGeoBuildStats(): void {
	buildMs.length = 0;
}

// Same reason as __bake: a console import() of this module resolves to a
// different instance under HMR and would report an empty set.
if (import.meta.env?.DEV) {
	(window as unknown as Record<string, unknown>).__geo = {
		stats: () => geoBuildStats(),
		reset: () => resetGeoBuildStats(),
	};
}

export function getRoomGeoSet(desc: RoomDesc): RoomGeoSet {
	const key = desc.signature;
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const t0 = performance.now();
	const set = buildSet(desc);
	buildMs.push(performance.now() - t0);
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
