/**
 * Attack geometry — byte-for-byte mirror of the Rust server
 * (packages/rust/simgrid/src/combat.rs). Pure target-selection for the three
 * combat pillars (melee / ranged / magic). Client prediction picks the same
 * tiles the authoritative server does; the server still owns hit truth.
 *
 * Pure functions over TileXY + an `isBlocked` predicate (the shared walkability
 * bitset). No RNG, no rendering — damage + crit rolls stay server-side / in the
 * determ module.
 */

import type { TileXY } from '../tile/path';

/** How an attack selects target tiles. Mirrors Rust `AttackShape`. */
export const AttackShape = {
	/** Single target within Chebyshev range. Melee. */
	Adjacent: 0,
	/** Tile raycast; first blocked tile or entity stops it. Bow / bolt. */
	Line: 1,
	/** Every tile within Chebyshev radius of the target. Magic AoE. */
	Aoe: 2,
} as const;
export type AttackShape = (typeof AttackShape)[keyof typeof AttackShape];

/** Default melee reach — a swing hits one Chebyshev-adjacent tile. */
export const MELEE_RANGE = 1;

function chebyshev(a: TileXY, b: TileXY): number {
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Whether `b` is within Chebyshev `range` of `a`. Mirrors Rust. */
export function inRangeAdjacent(a: TileXY, b: TileXY, range: number): boolean {
	return chebyshev(a, b) <= range;
}

/**
 * Bresenham line from `origin` toward `target`, at most `maxRange` steps
 * (origin excluded). Stops at and includes the first blocked tile. Returns the
 * ordered traversed tiles — the projectile's flight path. Mirrors Rust
 * `line_cast` exactly (same step order + termination).
 */
export function lineCast(
	origin: TileXY,
	target: TileXY,
	maxRange: number,
	isBlocked: (t: TileXY) => boolean,
): TileXY[] {
	const out: TileXY[] = [];
	let x = origin.x;
	let y = origin.y;
	const dx = Math.abs(target.x - x);
	const dy = -Math.abs(target.y - y);
	const sx = x < target.x ? 1 : -1;
	const sy = y < target.y ? 1 : -1;
	let err = dx + dy;
	let steps = 0;
	for (;;) {
		if (x === target.x && y === target.y) break;
		const e2 = 2 * err;
		if (e2 >= dy) {
			err += dy;
			x += sx;
		}
		if (e2 <= dx) {
			err += dx;
			y += sy;
		}
		steps++;
		const t = { x, y };
		out.push(t);
		if (isBlocked(t) || steps >= maxRange) break;
	}
	return out;
}

/**
 * Every tile within Chebyshev `radius` of `center` — a (2r+1)² square disc in
 * row-major order. The AoE footprint. Mirrors Rust `aoe_tiles`.
 */
export function aoeTiles(center: TileXY, radius: number): TileXY[] {
	const out: TileXY[] = [];
	for (let dy = -radius; dy <= radius; dy++) {
		for (let dx = -radius; dx <= radius; dx++) {
			out.push({ x: center.x + dx, y: center.y + dy });
		}
	}
	return out;
}
