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

// Building a whole sector at once costs 35-64ms, which lands as a visible stall
// the frame a new sector mounts. The work splits cleanly along part boundaries
// (bays alone are ~40% of it), so a build is expressed as an ordered step list
// that can be run all at once or a few steps per frame ahead of the player.
type BuildJob = {
	desc: RoomDesc;
	steps: Array<() => void>;
	step: number;
	set: RoomGeoSet;
	ms: number;
};

function emptySet(signature: string): RoomGeoSet {
	return {
		signature,
		walls: [],
		columns: [],
		floor: [],
		ceiling: [],
		arch: [],
		trim: [],
		cove: [],
		corner: [],
		domes: [],
		bays: { frames: [], backs: [] },
	};
}

function makeJob(desc: RoomDesc): BuildJob {
	const g = makeLocalGrid(desc);
	const v = desc.variant;
	const ctx = sectorBakeCtx(desc);
	const set = emptySet(desc.signature);
	let bays: { frames: THREE.BufferGeometry; backs: THREE.BufferGeometry };
	const steps: Array<() => void> = [
		() => {
			set.walls = buildWalls(g, v).map((m) => dice(m, ctx));
		},
		() => {
			set.columns = buildColumns(desc.columns).map((m) => dice(m, ctx));
		},
		() => {
			set.floor = floorGeo(desc, ctx);
		},
		() => {
			set.ceiling = ceilingGeo(desc, ctx);
		},
		() => {
			set.arch = dice(buildArches(g, v), ctx);
		},
		() => {
			set.trim = dice(buildTrims(g, v), ctx);
		},
		() => {
			set.cove = dice(buildCoves(g), ctx);
		},
		() => {
			set.corner = dice(buildCornerCoves(g, v), ctx);
		},
		() => {
			set.domes = desc.oases.length
				? dice(buildOasisDomes(g, desc.oases), ctx)
				: [];
		},
		// The single most expensive step, kept on its own so it never shares a
		// frame with another part.
		() => {
			bays = buildBays(g, v);
		},
		() => {
			set.bays.frames = dice(bays.frames, ctx);
		},
		() => {
			set.bays.backs = dice(bays.backs, ctx);
		},
	];
	return { desc, steps, step: 0, set, ms: 0 };
}

function runJob(job: BuildJob, budgetMs: number): boolean {
	const t0 = performance.now();
	while (job.step < job.steps.length) {
		const s0 = performance.now();
		job.steps[job.step++]();
		job.ms += performance.now() - s0;
		if (budgetMs > 0 && performance.now() - t0 >= budgetMs) break;
	}
	return job.step >= job.steps.length;
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
		ticks: () => geoTickStats(),
		depth: () => geoPrefetchDepth(),
		reset: () => resetGeoBuildStats(),
	};
}

// Jobs the prefetcher is part-way through, keyed like the cache. A job here is
// not renderable yet — getRoomGeoSet finishes it synchronously if the player
// arrives before the background pass got there.
const pending = new Map<string, BuildJob>();
const queue: string[] = [];

function commit(job: BuildJob): RoomGeoSet {
	pending.delete(job.desc.signature);
	buildMs.push(job.ms);
	cache.set(job.desc.signature, job.set);
	if (cache.size > CACHE_CAP) {
		const oldest = cache.keys().next().value as string;
		const evicted = cache.get(oldest);
		cache.delete(oldest);
		if (evicted) disposeSet(evicted);
	}
	return job.set;
}

/** Queue a sector to be built in the background. No-op if it is already built
 * or queued. Safe to call every time the mount set changes. */
export function prefetchRoomGeoSet(desc: RoomDesc): void {
	const key = desc.signature;
	if (cache.has(key) || pending.has(key)) return;
	pending.set(key, makeJob(desc));
	queue.push(key);
}

const tickMs: number[] = [];

/** Advance background sector builds within a per-frame budget. */
export function tickGeoPrefetch(budgetMs = 4): void {
	while (queue.length) {
		const key = queue[0];
		const job = pending.get(key);
		if (!job) {
			queue.shift();
			continue;
		}
		const t0 = performance.now();
		const done = runJob(job, budgetMs);
		tickMs.push(performance.now() - t0);
		if (done) {
			queue.shift();
			commit(job);
		}
		return;
	}
}

export function geoTickStats(): {
	ticks: number;
	worstMs: number;
	avgMs: number;
} {
	const total = tickMs.reduce((a, b) => a + b, 0);
	return {
		ticks: tickMs.length,
		worstMs: +Math.max(0, ...tickMs).toFixed(1),
		avgMs: tickMs.length ? +(total / tickMs.length).toFixed(2) : 0,
	};
}

export function geoPrefetchDepth(): number {
	return queue.length;
}

export function getRoomGeoSet(desc: RoomDesc): RoomGeoSet {
	const key = desc.signature;
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	// Arrived before the prefetcher finished (or never prefetched at all) —
	// drain the remaining steps now so a mount is never handed a partial set.
	const job = pending.get(key) ?? makeJob(desc);
	const i = queue.indexOf(key);
	if (i >= 0) queue.splice(i, 1);
	runJob(job, 0);
	return commit(job);
}

export function roomCacheStats(): { size: number; keys: string[] } {
	return { size: cache.size, keys: [...cache.keys()] };
}
