import {
	makeHeightSampler,
	seedFromWorld,
	HEIGHT_AMPLITUDE,
	type HeightSampler,
} from '@kbve/laser';
import { TILE_W, TILE_H } from './config';

export interface TileXY {
	x: number;
	y: number;
}

export interface PixelXY {
	x: number;
	y: number;
}

/**
 * Height rendering: the shared deterministic heightmap (simgrid heightfield /
 * FKBVEWorldHeightfield / laser heightAt) lifts every projected point so a
 * hill displaces on screen exactly as the Unreal client renders it. Height is
 * in Unreal uu (100 uu per tile); one tile of height = one tile of screen
 * lift, so uu -> px is TILE_H / 100. Surface floors only — dungeons stay flat.
 */
export const HEIGHT_RENDER_SCALE = 0.35;
export const HEIGHT_PX_PER_UU = (TILE_H / 100) * HEIGHT_RENDER_SCALE;
const HEIGHT_AMPLITUDE_PX = HEIGHT_AMPLITUDE * HEIGHT_PX_PER_UU;

let heightSampler: HeightSampler | null = null;
let heightEnabled = false;

/** Install the world seed at Welcome — mirrors the Unreal streamer re-seed. */
export function setIsoHeightSeed(worldSeed: number): void {
	heightSampler = makeHeightSampler(seedFromWorld(worldSeed));
}

/** Toggle the height term (surface floors on, dungeon floors off). */
export function setIsoHeightEnabled(enabled: boolean): void {
	heightEnabled = enabled;
}

export function isoHeightActive(): boolean {
	return heightEnabled && heightSampler !== null;
}

/** Terrain lift in screen px at a tile-space position (0 when disabled). */
export function terrainLiftPx(tx: number, ty: number): number {
	if (!heightEnabled || !heightSampler) return 0;
	return heightSampler(tx, ty) * HEIGHT_PX_PER_UU;
}

/** Terrain height in uu at a tile-space position (0 when disabled). */
export function terrainHeightUu(tx: number, ty: number): number {
	if (!heightEnabled || !heightSampler) return 0;
	return heightSampler(tx, ty);
}

export function worldToScreen(tx: number, ty: number): PixelXY {
	return {
		x: (tx - ty) * (TILE_W / 2),
		y: (tx + ty) * (TILE_H / 2) - terrainLiftPx(tx, ty),
	};
}

/** Flat projection — ignores terrain height. For ground-texture anchoring and
 * other math that must match the un-displaced iso plane. */
export function worldToScreenFlat(tx: number, ty: number): PixelXY {
	return {
		x: (tx - ty) * (TILE_W / 2),
		y: (tx + ty) * (TILE_H / 2),
	};
}

export function screenToWorld(px: number, py: number): TileXY {
	const f = screenToWorldF(px, py);
	return { x: Math.round(f.x), y: Math.round(f.y) };
}

function flatSolve(px: number, py: number): TileXY {
	const a = px / (TILE_W / 2);
	const b = py / (TILE_H / 2);
	return {
		x: (a + b) / 2,
		y: (b - a) / 2,
	};
}

/** Fractional world position for a screen point — no tile rounding. Use for aim
 * direction and projectile origins where sub-tile precision matters. With
 * height active this is a heightfield raycast on F(s) = lift(tile(py+s)) - s:
 * the screen ray can cross the displaced terrain more than once, and the
 * visible surface is the topmost crossing (largest s = greatest tx+ty depth),
 * so march down from +amplitude to bracket the first sign change, then bisect.
 * The march step is far below the noise wavelength in s-space, so no crossing
 * region is skipped. Naive fixed-point iteration diverges here — the
 * detail-noise slope exceeds the tile step. */
const RAY_MARCH_STEP_PX = 16;

export function screenToWorldF(px: number, py: number): TileXY {
	if (!heightEnabled || !heightSampler) return flatSolve(px, py);
	const amp = HEIGHT_AMPLITUDE_PX;
	const liftAt = (s: number): number => {
		const t = flatSolve(px, py + s);
		return terrainLiftPx(t.x, t.y);
	};
	let hi = amp;
	let lo = hi;
	let found = false;
	while (hi > -amp - RAY_MARCH_STEP_PX) {
		lo = hi - RAY_MARCH_STEP_PX;
		if (liftAt(lo) - lo >= 0) {
			found = true;
			break;
		}
		hi = lo;
	}
	if (!found) return flatSolve(px, py);
	for (let i = 0; i < 12; i++) {
		const mid = (lo + hi) / 2;
		if (liftAt(mid) - mid > 0) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return flatSolve(px, py + (lo + hi) / 2);
}

export function tileDepth(tx: number, ty: number): number {
	return tx + ty;
}
