import {
	LIGHT_RANGE,
	TORCH_STRIDE,
	type ResolvedBakeJob,
} from './bakeTypes';

const Q = 1e4;

function hashInto(h: number, v: number): number {
	let x = Math.round(v * Q) | 0;
	for (let b = 0; b < 4; b++) {
		h ^= x & 0xff;
		h = Math.imul(h, 0x01000193);
		x >>>= 8;
	}
	return h;
}

// Content address for a baked chunk, expressed in chunk-local space so the same
// wall run anywhere in the dungeon — or in a future WFC tiling — collides to one
// buffer. Everything the bake reads feeds the hash: geometry, the culled torch
// set, and the tile window the occlusion march can reach.
export function hashJob(job: ResolvedBakeJob): string {
	const pos = job.position;
	let minX = Infinity;
	let minZ = Infinity;
	for (let i = 0; i < pos.length; i += 3) {
		if (pos[i] < minX) minX = pos[i];
		if (pos[i + 2] < minZ) minZ = pos[i + 2];
	}
	const ox = Math.floor(minX / job.tile) * job.tile;
	const oz = Math.floor(minZ / job.tile) * job.tile;

	let h = 0x811c9dc5;
	h = hashInto(h, pos.length);
	h = hashInto(h, job.normal ? 1 : 0);
	for (let i = 0; i < pos.length; i += 3) {
		h = hashInto(h, pos[i] - ox);
		h = hashInto(h, pos[i + 1]);
		h = hashInto(h, pos[i + 2] - oz);
	}
	const nor = job.normal;
	if (nor) for (let i = 0; i < nor.length; i++) h = hashInto(h, nor[i]);

	const t = job.torches;
	for (let i = 0; i < t.length; i += TORCH_STRIDE) {
		h = hashInto(h, t[i] - ox);
		h = hashInto(h, t[i + 1]);
		h = hashInto(h, t[i + 2] - oz);
		h = hashInto(h, t[i + 3]);
		h = hashInto(h, t[i + 4]);
		h = hashInto(h, t[i + 5]);
		h = hashInto(h, t[i + 6]);
	}

	for (const a of job.att) h = hashInto(h, a);

	let maxX = -Infinity;
	let maxZ = -Infinity;
	for (let i = 0; i < pos.length; i += 3) {
		if (pos[i] > maxX) maxX = pos[i];
		if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
	}
	const pad = Math.ceil(LIGHT_RANGE / job.tile) + 1;
	const c0 = Math.floor(ox / job.tile) - pad;
	const r0 = Math.floor(oz / job.tile) - pad;
	const c1 = Math.ceil(maxX / job.tile) + pad;
	const r1 = Math.ceil(maxZ / job.tile) + pad;
	for (let r = r0; r <= r1; r++) {
		for (let c = c0; c <= c1; c++) {
			const inside = c >= 0 && r >= 0 && c < job.cols && r < job.rows;
			h = hashInto(h, inside ? job.tiles[r * job.cols + c] : 255);
		}
	}

	return (h >>> 0).toString(36) + ':' + pos.length;
}
