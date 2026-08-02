import {
	farWeight,
	FLICKER_MEAN,
	LIGHT_RANGE,
	TORCH_STRIDE,
	type ResolvedBakeJob,
} from './bakeTypes';

const OCC_STEPS = 34;
const OCCLUDES = 1 << 1;

function tileAt(
	tiles: Uint8Array,
	cols: number,
	rows: number,
	x: number,
	z: number,
	tile: number,
): number {
	const col = Math.floor(x / tile);
	const row = Math.floor(z / tile);
	if (col < 0 || row < 0 || col >= cols || row >= rows) return 0;
	return tiles[row * cols + col] & OCCLUDES ? 1 : 0;
}

// Same march the shader runs per-fragment, done once per vertex instead.
function visibility(
	job: ResolvedBakeJob,
	px: number,
	pz: number,
	lx: number,
	lz: number,
): number {
	const dx = lx - px;
	const dz = lz - pz;
	const len = Math.hypot(dx, dz);
	if (len < 0.6) return 1;
	const ix = dx / len;
	const iz = dz / len;
	const end = len - 0.45;
	for (let k = 0; k < OCC_STEPS; k++) {
		const s = 0.5 + k * 0.32;
		if (s >= end) break;
		if (
			tileAt(
				job.tiles,
				job.cols,
				job.rows,
				px + ix * s,
				pz + iz * s,
				job.tile,
			) > 0.75
		)
			return 0;
	}
	return 1;
}

export function bakeChunk(job: ResolvedBakeJob): Float32Array {
	const pos = job.position;
	const nor = job.normal;
	const n = pos.length / 3;
	const out = new Float32Array(n * 3);
	const t = job.torches;
	const count = t.length / TORCH_STRIDE;
	if (!count) return out;

	for (let v = 0; v < n; v++) {
		const px = pos[v * 3];
		const py = pos[v * 3 + 1];
		const pz = pos[v * 3 + 2];
		let nx = 0;
		let ny = 0;
		let nz = 0;
		let hasN = false;
		if (nor) {
			nx = nor[v * 3];
			ny = nor[v * 3 + 1];
			nz = nor[v * 3 + 2];
			const nl = Math.hypot(nx, ny, nz);
			if (nl > 1e-6) {
				nx /= nl;
				ny /= nl;
				nz /= nl;
				hasN = true;
			}
		}

		let ar = 0;
		let ag = 0;
		let ab = 0;
		for (let i = 0; i < count; i++) {
			const o = i * TORCH_STRIDE;
			const lx = t[o];
			const ly = t[o + 1];
			const lz = t[o + 2];
			const dx = lx - px;
			const dy = ly - py;
			const dz = lz - pz;
			const d = Math.hypot(dx, dy, dz);
			const win = Math.min(
				Math.max(1 - Math.pow(d / LIGHT_RANGE, 4), 0),
				1,
			);
			if (win <= 0) continue;

			let lambert = 1;
			if (hasN) {
				const inv = 1 / Math.max(d, 0.001);
				const ndl = nx * dx * inv + ny * dy * inv + nz * dz * inv;
				lambert = Math.max(ndl * 0.75 + 0.25, 0);
				lambert *= lambert;
			}
			const [k0, k1, k2, cap] = job.att;
			const att = Math.min(1 / Math.max(k0 + k1 * d + k2 * d * d, 0.05), cap);
			const base = att * win * win * lambert * farWeight(d);
			if (base < 0.004) continue;
			const vis = visibility(job, px, pz, lx, lz);
			if (vis <= 0) continue;

			const s = base * vis * t[o + 6] * FLICKER_MEAN;
			ar += t[o + 3] * s;
			ag += t[o + 4] * s;
			ab += t[o + 5] * s;
		}
		out[v * 3] = ar;
		out[v * 3 + 1] = ag;
		out[v * 3 + 2] = ab;
	}
	return out;
}
