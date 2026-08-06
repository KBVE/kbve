import { worldToScreen, type TileXY } from '../iso';

/**
 * Target acquisition for projectiles, shared by the bow and by targeted spells.
 *
 * Both weapons pick their target the same way and only differ in constants, so
 * the geometry lives here once. Nothing in this module touches Phaser or the
 * entity store — callers adapt whatever they have into `AimCandidate`s — which
 * is what makes the aim rules testable without a renderer.
 */

/** A hostile the caller has already filtered down and resolved a sprite for. */
export interface AimCandidate {
	id: number;
	/** Ground tile, used for range and for the tile-space ray. */
	tile: TileXY;
	/**
	 * On-screen sprite position, for the screen-space cone. Absent when the
	 * entity has no sprite drawn yet — such a candidate is invisible, so the
	 * cone skips it while the tile-space ray still counts it.
	 */
	screen?: { x: number; y: number };
}

export interface ConeOptions {
	/** Cone half-width in SCREEN px. */
	halfPx: number;
	/** Max tile distance from the shooter. <= 0 means unbounded. */
	range: number;
}

export interface RayOptions {
	/** Max perpendicular offset from the centerline, in TILES. */
	perp: number;
	/** Max tile distance along the ray. <= 0 means unbounded. */
	range: number;
}

const cap = (range: number) => (range > 0 ? range : Infinity);

/**
 * Closest candidate to the shooter→aim line in SCREEN space, among those in
 * front of the shooter, in range, and inside the cone.
 *
 * Screen space rather than tile space is the point: a flyer is drawn above its
 * ground tile, so a tile-space ray sails over the wyvern the player is plainly
 * pointing at. Matching sprite to on-screen aim line is what the player sees.
 *
 * Returns null when the aim line is degenerate (aiming at your own feet) so the
 * caller can choose its own fallback.
 */
export function coneTarget(
	candidates: Iterable<AimCandidate>,
	from: TileXY,
	aim: TileXY,
	opts: ConeOptions,
): number | null {
	const a = worldToScreen(from.x, from.y);
	const b = worldToScreen(aim.x, aim.y);
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-3) return null;
	const nx = dx / len;
	const ny = dy / len;
	const maxTiles = cap(opts.range);
	let best: number | null = null;
	let bestPerp = opts.halfPx;
	for (const c of candidates) {
		if (!c.screen) continue;
		if (Math.hypot(c.tile.x - from.x, c.tile.y - from.y) > maxTiles)
			continue;
		const rx = c.screen.x - a.x;
		const ry = c.screen.y - a.y;
		if (rx * nx + ry * ny <= 0) continue;
		const perp = Math.abs(rx * ny - ry * nx);
		if (perp < bestPerp) {
			bestPerp = perp;
			best = c.id;
		}
	}
	return best;
}

/**
 * Nearest candidate along the aim ray in TILE space: the plain projectile model
 * — it flies where aimed and hits the first thing in its path, or nothing.
 * Used as the fallback when the screen-space cone comes up empty.
 */
export function rayTarget(
	candidates: Iterable<AimCandidate>,
	from: TileXY,
	aim: TileXY,
	opts: RayOptions,
): number | null {
	const adx = aim.x - from.x;
	const ady = aim.y - from.y;
	const amag = Math.hypot(adx, ady);
	if (amag < 1e-3) return null;
	const nx = adx / amag;
	const ny = ady / amag;
	const maxTiles = cap(opts.range);
	let best: number | null = null;
	let bestAlong = Infinity;
	for (const c of candidates) {
		const dx = c.tile.x - from.x;
		const dy = c.tile.y - from.y;
		const along = dx * nx + dy * ny;
		if (along <= 0 || along > maxTiles) continue;
		if (Math.abs(dx * ny - dy * nx) > opts.perp) continue;
		if (along < bestAlong) {
			bestAlong = along;
			best = c.id;
		}
	}
	return best;
}
