import { bakeChunk } from './bakeLight';
import { hashJob } from './bakeHash';
import type { BakeJob, BakeResult } from './bakeTypes';

const ctx = globalThis as unknown as Worker;

// Tile grids are per sector, not per chunk. Caching them here lets the main
// thread send each sector's grid once instead of copying it for every chunk.
const tileCache = new Map<string, { tiles: Uint8Array; cols: number; rows: number }>();

ctx.onmessage = (e: MessageEvent<BakeJob[]>) => {
	const results: BakeResult[] = [];
	const transfer: ArrayBuffer[] = [];
	for (const job of e.data) {
		if (job.tiles) {
			tileCache.set(job.sector, {
				tiles: job.tiles,
				cols: job.cols,
				rows: job.rows,
			});
			if (tileCache.size > 64)
				tileCache.delete(tileCache.keys().next().value as string);
		}
		const grid = tileCache.get(job.sector);
		if (!grid) continue;
		const full = {
			...job,
			tiles: grid.tiles,
			cols: grid.cols,
			rows: grid.rows,
		};
		// Hashing here keeps an O(vertices) pass off the sector-build frame.
		const key = hashJob(full);
		const bake = bakeChunk(full);
		results.push({ id: job.id, key, bake });
		transfer.push(bake.buffer as ArrayBuffer);
	}
	ctx.postMessage(results, transfer);
};
