export interface BakeTorch {
	x: number;
	y: number;
	z: number;
	r: number;
	g: number;
	b: number;
	intensity: number;
}

export interface BakeJob {
	id: number;
	sector: string;
	position: Float32Array;
	normal: Float32Array | null;
	torches: Float32Array;
	// Sent only the first time a sector is seen; the worker caches it after.
	tiles: Uint8Array | null;
	cols: number;
	rows: number;
	tile: number;
	// Attenuation curve (k0, k1, k2, cap) — must match the shader's uAtt or
	// the baked far field and the dynamic near field disagree at the seam.
	att: [number, number, number, number];
}

// A job once the worker has resolved its sector tile grid from cache.
export type ResolvedBakeJob = Omit<BakeJob, 'tiles'> & { tiles: Uint8Array };

export interface BakeResult {
	id: number;
	bake: Float32Array;
}

// Mirrors the PSX fragment light loop's diffuse terms. Specular and the POM
// self-shadow stay dynamic-only, so nothing here double-counts with them.
export { LIGHT_RANGE } from '../../config';
export const FLICKER_MEAN = 0.85;
export const TORCH_STRIDE = 7;

// Near/far split. Vertex lighting can't hold a 1/d^2 hotspot across a 3-unit
// quad, so the bake takes only the far field (smooth, interpolates fine) and
// the per-fragment loop keeps the near field (sharp, needs normal maps and
// specular). The two weights sum to 1 at every distance, so no double-count.
export const NEAR_D0 = 2.5;
export const NEAR_D1 = 7.5;

export function farWeight(d: number): number {
	const t = Math.min(Math.max((d - NEAR_D0) / (NEAR_D1 - NEAR_D0), 0), 1);
	return t * t * (3 - 2 * t);
}
