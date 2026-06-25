import { BIOMES, biomeTextureKey, type BiomeId } from '../config';

const BIOME_SEED = 0x1337c0de;
const REGION_FREQ = 0.11;

function hash2(ix: number, iy: number, seed: number): number {
	let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = smooth(x - x0);
	const fy = smooth(y - y0);
	const a = hash2(x0, y0, seed);
	const b = hash2(x0 + 1, y0, seed);
	const c = hash2(x0, y0 + 1, seed);
	const d = hash2(x0 + 1, y0 + 1, seed);
	return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function biomeAt(cx: number, cy: number): BiomeId {
	const n = valueNoise(cx * REGION_FREQ, cy * REGION_FREQ, BIOME_SEED);
	const i = Math.min(BIOMES.length - 1, Math.floor(n * BIOMES.length));
	return BIOMES[i];
}

export function biomeKeyAt(cx: number, cy: number): string {
	return biomeTextureKey(biomeAt(cx, cy));
}
