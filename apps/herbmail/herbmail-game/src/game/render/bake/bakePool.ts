import * as THREE from 'three';
import {
	LIGHT_RANGE,
	TORCH_STRIDE,
	type BakeJob,
	type BakeResult,
} from './bakeTypes';

import { attParams } from '../lightGain';

export const BAKE_ATTR = 'aBake';

const WORKERS = 2;

// There is deliberately no second-level cache of finished bakes here. It was
// content-addressed once, on the theory that an identical wall run anywhere in
// the dungeon resolves to one buffer. Measured over 2428 bakes: chunk geometry
// does repeat (1145 duplicates), but folding in the culled torch set drops that
// to 6 and the occlusion tile window to 0 — the bake is a function of the
// lighting environment, which is unique per chunk. The hash cost 19% of worker
// bake time for a 0% hit rate. Nor could a sector-keyed cache work: a revisit
// only re-bakes once the 96-sector geometry cache has evicted the sector, which
// implies 96 intervening sector builds. That cache is the one that matters.
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

function apply(r: BakeResult): void {
	const geo = inFlight.get(r.id);
	inFlight.delete(r.id);
	if (!geo) return;
	if (live.has(geo))
		geo.setAttribute(BAKE_ATTR, new THREE.BufferAttribute(r.bake, 3));
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

	sectorPending.set(
		ctx.signature,
		(sectorPending.get(ctx.signature) ?? 0) + 1,
	);
	bakes++;

	const pos = posAttr.array as Float32Array;
	const norAttr = geo.getAttribute('normal') as
		| THREE.BufferAttribute
		| undefined;
	const nor = norAttr ? (norAttr.array as Float32Array) : null;

	// Only torches whose glow can reach this chunk matter; culling here is what
	// keeps the bake near-linear.
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

	geo.setAttribute(
		BAKE_ATTR,
		new THREE.BufferAttribute(new Float32Array(pos.length), 3),
	);

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

let bakes = 0;
let enabled = true;

export function setBakeEnabled(v: boolean): void {
	enabled = v;
}

export function bakeEnabled(): boolean {
	return enabled;
}

export function bakePoolStats(): { bakes: number; pending: number } {
	return { bakes, pending: inFlight.size };
}

export function resetBakeStats(): void {
	bakes = 0;
}

// Exposed on the app's own module instance: a console `import()` of this file
// resolves to a different instance under HMR, so toggling through that lies.
if (import.meta.env?.DEV) {
	(window as unknown as Record<string, unknown>).__bake = {
		on: () => setBakeEnabled(true),
		off: () => setBakeEnabled(false),
		stats: () => bakePoolStats(),
		reset: () => resetBakeStats(),
	};
}
