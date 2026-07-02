/**
 * Canonical shared heightmap — mirror of simgrid `heightfield::height_at`
 * (Rust) and `FKBVEWorldHeightfield::HeightAt` (KBVEWorldCore, C++), all over
 * FastNoiseLite 1.1.1. Height is a pure function of (seed, tile); it never
 * rides the wire — `EntityDelta.z` stays the floor index.
 *
 * The JS FastNoiseLite port computes in f64 while Rust/C++ use f32, so this
 * mirror is near-exact rather than bit-exact; the pinned vectors in
 * heightfield.spec.ts assert agreement within a small epsilon. Use it for
 * rendering offsets, not for server-verified predictions.
 */
import FastNoiseLite from 'fastnoise-lite';

export const CONTINENT_FREQ = 0.01;
export const CONTINENT_OCTAVES = 5;
export const CONTINENT_GAIN = 0.5;
export const CONTINENT_LACUNARITY = 2.05;

export const DETAIL_FREQ = 0.08;
export const DETAIL_OCTAVES = 3;
export const DETAIL_GAIN = 0.45;
export const DETAIL_LACUNARITY = 2.1;
export const DETAIL_SEED_OFFSET = 1024;

export const CONTINENT_WEIGHT = 0.78;
export const DETAIL_WEIGHT = 0.22;
export const HEIGHT_AMPLITUDE = 900.0;

/** Canonical i64-ish world seed → i32 noise seed truncation. */
export function seedFromWorld(worldSeed: number | bigint): number {
	const low = BigInt(worldSeed) & 0xffffffffn;
	return Number(BigInt.asIntN(32, low));
}

function buildFbm(
	seed: number,
	frequency: number,
	octaves: number,
	gain: number,
	lacunarity: number,
): FastNoiseLite {
	const noise = new FastNoiseLite(seed);
	noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
	noise.SetFractalType(FastNoiseLite.FractalType.FBm);
	noise.SetFrequency(frequency);
	noise.SetFractalOctaves(octaves);
	noise.SetFractalGain(gain);
	noise.SetFractalLacunarity(lacunarity);
	return noise;
}

export type HeightSampler = (tileX: number, tileY: number) => number;

/**
 * Cached sampler for hot paths (per-frame projection, ground textures) — one
 * FastNoiseLite pair per seed instead of two allocations per sample.
 */
export function makeHeightSampler(seed: number): HeightSampler {
	const continent = buildFbm(
		seed,
		CONTINENT_FREQ,
		CONTINENT_OCTAVES,
		CONTINENT_GAIN,
		CONTINENT_LACUNARITY,
	);
	const detail = buildFbm(
		(seed + DETAIL_SEED_OFFSET) | 0,
		DETAIL_FREQ,
		DETAIL_OCTAVES,
		DETAIL_GAIN,
		DETAIL_LACUNARITY,
	);
	return (tileX, tileY) => {
		const mix =
			CONTINENT_WEIGHT * continent.GetNoise(tileX, tileY) +
			DETAIL_WEIGHT * detail.GetNoise(tileX, tileY);
		return Math.min(1, Math.max(-1, mix)) * HEIGHT_AMPLITUDE;
	};
}

/** Height in Unreal uu for a tile-space position. */
export function heightAt(seed: number, tileX: number, tileY: number): number {
	return makeHeightSampler(seed)(tileX, tileY);
}
