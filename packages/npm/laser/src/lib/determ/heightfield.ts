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
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient declaration must travel with this file into consumers that alias @kbve/laser to source
/// <reference path="../../types/fastnoise-lite.d.ts" />
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

/**
 * River network. The carve is part of the height function, not a layer over it:
 * a riverbed only the renderer knows about is ground the server still calls
 * solid. Pure function of (seed, tile), so nothing has to be transmitted.
 */
export const RIVER_FREQ = 0.001;
export const RIVER_OCTAVES = 2;
export const RIVER_GAIN = 0.5;
export const RIVER_LACUNARITY = 2.0;
export const RIVER_SEED_OFFSET = 7717;

export const RIVER_WARP_FREQ = 0.006;
export const RIVER_WARP_OCTAVES = 2;
export const RIVER_WARP_AMP = 45.0;
export const RIVER_WARP_SEED_OFFSET = 91237;
export const RIVER_WARP_LOBE = 137.0;

/**
 * Half-width of the channel in TILES, not in noise units — the difference
 * between a river and a chain of ponds. A band of constant noise value is wide
 * where the field is flat and pinched where it is steep; dividing by the
 * gradient turns the value back into a distance.
 */
export const RIVER_WIDTH_TILES = 7.0;
/**
 * Wide on purpose: the gradient is a difference of two nearly equal noise
 * values, so a short step is dominated by cancellation — and the channel width
 * is that gradient divided into the noise value, so the error lands directly on
 * how wide the river is.
 */
export const RIVER_GRADIENT_STEP = 2.0;

export const WATER_Z = -140.0;
export const RIVERBED_DEPTH = 160.0;

/**
 * How high above the water rivers still run. The water surface is one flat
 * plane, so a channel carved across a hilltop is a dry trench; fading the carve
 * out with elevation keeps every channel that does exist full.
 */
export const RIVER_MAX_ELEVATION = 260.0;

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
export type RiverSampler = (tileX: number, tileY: number) => number;

export interface HeightField {
	baseHeight: HeightSampler;
	riverMask: RiverSampler;
	height: HeightSampler;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * The four noise fields the world is made of, built once. Every sample needs
 * all four now that the river gates on elevation, so building them per call is
 * what makes the naive form of this the dominant cost of a patch.
 */
export function makeHeightField(seed: number): HeightField {
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
	const warp = buildFbm(
		(seed + RIVER_WARP_SEED_OFFSET) | 0,
		RIVER_WARP_FREQ,
		RIVER_WARP_OCTAVES,
		RIVER_GAIN,
		RIVER_LACUNARITY,
	);
	const channel = buildFbm(
		(seed + RIVER_SEED_OFFSET) | 0,
		RIVER_FREQ,
		RIVER_OCTAVES,
		RIVER_GAIN,
		RIVER_LACUNARITY,
	);

	const baseHeight: HeightSampler = (tileX, tileY) => {
		const mix =
			CONTINENT_WEIGHT * continent.GetNoise(tileX, tileY) +
			DETAIL_WEIGHT * detail.GetNoise(tileX, tileY);
		return Math.min(1, Math.max(-1, mix)) * HEIGHT_AMPLITUDE;
	};

	const channelAt = (tileX: number, tileY: number) => {
		const wx = tileX + RIVER_WARP_AMP * warp.GetNoise(tileX, tileY);
		const wy =
			tileY +
			RIVER_WARP_AMP *
				warp.GetNoise(tileX + RIVER_WARP_LOBE, tileY - RIVER_WARP_LOBE);
		return channel.GetNoise(wx, wy);
	};

	/**
	 * Saturating a gaussian rather than using it raw is what gives the profile a
	 * flat floor with banks either side. A plain falloff makes a V, which reads
	 * as a ditch someone dug rather than as water that has been running there.
	 */
	const riverMask: RiverSampler = (tileX, tileY) => {
		const n = channelAt(tileX, tileY);
		const step = RIVER_GRADIENT_STEP;
		const gx = (channelAt(tileX + step, tileY) - n) / step;
		const gy = (channelAt(tileX, tileY + step) - n) / step;
		const gradient = Math.max(Math.sqrt(gx * gx + gy * gy), 1e-6);

		const distance = Math.abs(n) / gradient;
		const falloff = Math.exp(
			-(distance * distance) /
				(2 * RIVER_WIDTH_TILES * RIVER_WIDTH_TILES),
		);

		const above = baseHeight(tileX, tileY) - WATER_Z;
		const gate =
			1 -
			smoothstep(RIVER_MAX_ELEVATION * 0.6, RIVER_MAX_ELEVATION, above);

		return Math.min(1, Math.max(0, falloff * 1.15)) * gate;
	};

	/**
	 * Lerps toward an absolute bed rather than subtracting a depth. Subtracting
	 * carries the terrain's own detail down with it, so the river floor keeps
	 * the bumps of the hillside it cut through and reads as a string of holes.
	 */
	const height: HeightSampler = (tileX, tileY) => {
		const h = baseHeight(tileX, tileY);
		const bed = WATER_Z - RIVERBED_DEPTH;
		return h + (bed - h) * riverMask(tileX, tileY);
	};

	return { baseHeight, riverMask, height };
}

/** Cached sampler for hot paths (per-frame projection, ground textures). */
export function makeHeightSampler(seed: number): HeightSampler {
	return makeHeightField(seed).height;
}

export function makeRiverSampler(seed: number): RiverSampler {
	return makeHeightField(seed).riverMask;
}

export function riverMask(seed: number, tileX: number, tileY: number): number {
	return makeHeightField(seed).riverMask(tileX, tileY);
}

/** Height in Unreal uu for a tile-space position. */
export function heightAt(seed: number, tileX: number, tileY: number): number {
	return makeHeightSampler(seed)(tileX, tileY);
}
