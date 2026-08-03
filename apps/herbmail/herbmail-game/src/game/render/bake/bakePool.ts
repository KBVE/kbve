import * as THREE from 'three';
import {
	LIGHT_RANGE,
	TORCH_STRIDE,
	type BakeJob,
	type BakeResult,
} from './bakeTypes';

import { attParams } from '../lightGain';

export const BAKE_ATTR = 'aBake';

const POOL_CAP = 512;
const WORKERS = 2;

// Content-addressed: the key is a hash of everything the bake reads, expressed
// in chunk-local space, so an identical wall run anywhere in the dungeon — or in
// a future WFC tiling — resolves to the same buffer with an O(1) lookup.
const pool = new Map<string, THREE.BufferAttribute>();
const inFlight = new Map<number, THREE.BufferGeometry>();
const sectorsSent = new Set<string>();
const sectorWorker = new Map<string, number>();
const live = new WeakSet<THREE.BufferGeometry>();
let nextJobId = 1;

const bakedSectors = new Set<string>();
const sectorPending = new Map<string, number>();

let workers: Worker[] = [];
let nextWorker = 0;

function ensureWorkers(): Worker[] {
	if (workers.length) return workers;
	for (let i = 0; i < WORKERS; i++) {
		const w = new Worker(new URL('./bakeWorker.ts', import.meta.url), {
			type: 'module',
		});
		w.onmessage = (e: MessageEvent<BakeResult[]>) => {
			const t0 = performance.now();
			for (const r of e.data) apply(r);
			applyMs += performance.now() - t0;
			applied += e.data.length;
			batches++;
		};
		workers.push(w);
	}
	return workers;
}

function touch(key: string, attr: THREE.BufferAttribute): void {
	pool.delete(key);
	pool.set(key, attr);
	if (pool.size > POOL_CAP) {
		const oldest = pool.keys().next().value as string;
		pool.delete(oldest);
	}
}

function apply(r: BakeResult): void {
	// The worker addresses by content, so an identical chunk baked elsewhere
	// resolves to the buffer already on the GPU and this one is dropped.
	const pooled = pool.get(r.key);
	let attr: THREE.BufferAttribute;
	if (pooled) {
		hits++;
		attr = pooled;
		touch(r.key, pooled);
	} else {
		misses++;
		attr = new THREE.BufferAttribute(r.bake, 3);
		touch(r.key, attr);
	}
	const geo = inFlight.get(r.id);
	inFlight.delete(r.id);
	if (!geo) return;
	if (live.has(geo)) geo.setAttribute(BAKE_ATTR, attr);
	const sector = geo.userData.bakeSector as string | undefined;
	if (sector) decSector(sector);
}

function decSector(sector: string): void {
	const left = (sectorPending.get(sector) ?? 1) - 1;
	if (left <= 0) {
		sectorPending.delete(sector);
		bakedSectors.add(sector);
	} else {
		sectorPending.set(sector, left);
	}
}

export function isSectorBaked(signature: string): boolean {
	return bakedSectors.has(signature);
}

export function forgetSector(signature: string): void {
	bakedSectors.delete(signature);
	sectorPending.delete(signature);
	sectorsSent.delete(signature);
	sectorWorker.delete(signature);
}

export function releaseBaked(geo: THREE.BufferGeometry): void {
	live.delete(geo);
}

export interface SectorBakeCtx {
	signature: string;
	tiles: Uint8Array;
	cols: number;
	rows: number;
	tile: number;
	torches: Float32Array;
}

export function requestChunkBake(
	geo: THREE.BufferGeometry,
	ctx: SectorBakeCtx,
): void {
	const posAttr = geo.getAttribute('position') as
		| THREE.BufferAttribute
		| undefined;
	if (!posAttr || !enabled) return;
	live.add(geo);
	geo.userData.bakeSector = ctx.signature;

	const pos = posAttr.array as Float32Array;
	const norAttr = geo.getAttribute('normal') as
		| THREE.BufferAttribute
		| undefined;
	const nor = norAttr ? (norAttr.array as Float32Array) : null;

	// Only torches whose glow can reach this chunk matter; culling here is what
	// keeps the bake near-linear and makes keys collide usefully across sectors.
	geo.computeBoundingSphere();
	const bs = geo.boundingSphere;
	const reach = LIGHT_RANGE + (bs ? bs.radius : 0);
	const near: number[] = [];
	for (let i = 0; i < ctx.torches.length; i += TORCH_STRIDE) {
		const tx = ctx.torches[i];
		const ty = ctx.torches[i + 1];
		const tz = ctx.torches[i + 2];
		if (bs) {
			const dx = tx - bs.center.x;
			const dy = ty - bs.center.y;
			const dz = tz - bs.center.z;
			if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
		}
		near.push(
			tx,
			ty,
			tz,
			ctx.torches[i + 3],
			ctx.torches[i + 4],
			ctx.torches[i + 5],
			ctx.torches[i + 6],
		);
	}

	sectorPending.set(
		ctx.signature,
		(sectorPending.get(ctx.signature) ?? 0) + 1,
	);
	geo.setAttribute(
		BAKE_ATTR,
		new THREE.BufferAttribute(new Float32Array(pos.length), 3),
	);

	// No hashing here on purpose: an O(vertices) pass on the sector-build frame
	// doubled build time. The worker hashes instead and the pool dedupes on the
	// key it returns.
	const a = attParams();
	const id = nextJobId++;
	inFlight.set(id, geo);
	const firstForSector = !sectorsSent.has(ctx.signature);
	if (firstForSector) sectorsSent.add(ctx.signature);

	const job: BakeJob = {
		id,
		sector: ctx.signature,
		position: pos.slice(),
		normal: nor ? nor.slice() : null,
		torches: new Float32Array(near),
		tiles: firstForSector ? ctx.tiles.slice() : null,
		cols: ctx.cols,
		rows: ctx.rows,
		tile: ctx.tile,
		att: [a.k0, a.k1, a.k2, a.cap],
	};

	// Pinned: the worker caches this sector's tile grid, so every chunk of the
	// sector must land on the same one.
	let wi = sectorWorker.get(ctx.signature);
	if (wi === undefined) {
		wi = nextWorker++ % WORKERS;
		sectorWorker.set(ctx.signature, wi);
	}
	const w = ensureWorkers()[wi];
	w.postMessage(
		[job],
		[
			job.position.buffer,
			job.torches.buffer,
			...(job.tiles ? [job.tiles.buffer] : []),
			...(job.normal ? [job.normal.buffer] : []),
		],
	);
}

let applyMs = 0;
let applied = 0;
let batches = 0;

export function bakeApplyStats(): {
	applied: number;
	batches: number;
	ms: number;
	pending: number;
} {
	return {
		applied,
		batches,
		ms: +applyMs.toFixed(1),
		pending: inFlight.size,
	};
}

let hashMs = 0;
let hits = 0;
let misses = 0;
let coalesced = 0;
let enabled = true;

export function setBakeEnabled(v: boolean): void {
	enabled = v;
}

export function bakeEnabled(): boolean {
	return enabled;
}

export function bakePoolStats(): {
	pooled: number;
	pending: number;
	hits: number;
	misses: number;
	coalesced: number;
	hitRate: number;
} {
	const total = hits + misses + coalesced;
	return {
		pooled: pool.size,
		pending: inFlight.size,
		hits,
		misses,
		coalesced,
		hitRate: total ? +((100 * (hits + coalesced)) / total).toFixed(1) : 0,
	};
}

export function resetBakeStats(): void {
	hits = 0;
	misses = 0;
	coalesced = 0;
	hashMs = 0;
}

// Exposed on the app's own module instance: a console `import()` of this file
// resolves to a different instance under HMR, so toggling through that lies.
if (import.meta.env?.DEV) {
	(window as unknown as Record<string, unknown>).__bake = {
		on: () => setBakeEnabled(true),
		off: () => setBakeEnabled(false),
		stats: () => bakePoolStats(),
		reset: () => resetBakeStats(),
		hashMs: () => +hashMs.toFixed(1),
	};
}
