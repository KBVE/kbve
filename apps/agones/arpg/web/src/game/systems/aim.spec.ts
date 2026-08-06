import { describe, it, expect } from 'vitest';
import { coneTarget, rayTarget, type AimCandidate } from './aim';
import { worldToScreen, type TileXY } from '../iso';

/**
 * Candidates are built through the real iso projection rather than hardcoded
 * pixels, so these stay honest if TILE_W/TILE_H ever change. `lift` raises the
 * sprite above its ground tile the way a hovering flyer is drawn.
 */
function cand(id: number, x: number, y: number, lift = 0): AimCandidate {
	const s = worldToScreen(x, y);
	return { id, tile: { x, y }, screen: { x: s.x, y: s.y - lift } };
}

const ORIGIN: TileXY = { x: 0, y: 0 };
const WIDE = { halfPx: 55, range: 15 };

describe('coneTarget', () => {
	it('returns null with no candidates', () => {
		expect(coneTarget([], ORIGIN, { x: 5, y: 0 }, WIDE)).toBeNull();
	});

	it('returns null when the aim line is degenerate', () => {
		// Aiming at your own feet has no direction to project onto.
		expect(coneTarget([cand(1, 3, 0)], ORIGIN, ORIGIN, WIDE)).toBeNull();
	});

	it('picks the candidate closest to the aim line, not the nearest one', () => {
		const onLine = cand(1, 8, 0);
		const closerButOffAxis = cand(2, 3, 3);
		const target = coneTarget(
			[closerButOffAxis, onLine],
			ORIGIN,
			{ x: 10, y: 0 },
			WIDE,
		);
		expect(target).toBe(1);
	});

	it('ignores candidates behind the shooter', () => {
		const behind = cand(1, -5, 0);
		expect(coneTarget([behind], ORIGIN, { x: 5, y: 0 }, WIDE)).toBeNull();
	});

	it('ignores candidates beyond range', () => {
		const far = cand(1, 20, 0);
		expect(
			coneTarget(
				[far],
				ORIGIN,
				{ x: 25, y: 0 },
				{ halfPx: 55, range: 15 },
			),
		).toBeNull();
		// Same candidate, unbounded range.
		expect(
			coneTarget(
				[far],
				ORIGIN,
				{ x: 25, y: 0 },
				{ halfPx: 55, range: 0 },
			),
		).toBe(1);
	});

	it('treats a negative range as unbounded', () => {
		expect(
			coneTarget(
				[cand(1, 30, 0)],
				ORIGIN,
				{ x: 40, y: 0 },
				{ halfPx: 55, range: -1 },
			),
		).toBe(1);
	});

	it('ignores candidates outside the cone half-width', () => {
		const off = cand(1, 4, 4);
		// On the (1,1) diagonal the sprite is far off a due-east screen line.
		expect(
			coneTarget(
				[off],
				ORIGIN,
				{ x: 10, y: 0 },
				{ halfPx: 4, range: 15 },
			),
		).toBeNull();
		expect(
			coneTarget(
				[off],
				ORIGIN,
				{ x: 10, y: 0 },
				{ halfPx: 400, range: 15 },
			),
		).toBe(1);
	});

	it('skips a candidate that has no sprite drawn yet', () => {
		const invisible: AimCandidate = { id: 1, tile: { x: 5, y: 0 } };
		expect(
			coneTarget([invisible], ORIGIN, { x: 10, y: 0 }, WIDE),
		).toBeNull();
	});

	it('connects with a hovering flyer that a tile-space ray sails over', () => {
		// The wyvern's TILE is well off the aim line, but it is DRAWN high enough
		// that its sprite sits right on the on-screen line — which is what the
		// player is pointing at. This is the whole reason the cone is screen-space.
		const flyerTile = { x: 6, y: 2 };
		const aim = { x: 10, y: 0 };
		// Lift chosen so the sprite lands on the screen line to the aim point.
		const lift =
			worldToScreen(flyerTile.x, flyerTile.y).y -
			worldToScreen(aim.x, aim.y).y *
				(worldToScreen(flyerTile.x, flyerTile.y).x /
					worldToScreen(aim.x, aim.y).x);
		const flyer = cand(1, flyerTile.x, flyerTile.y, lift);

		expect(coneTarget([flyer], ORIGIN, aim, WIDE)).toBe(1);
		// The tile-space ray, given the same geometry, misses it entirely.
		expect(
			rayTarget([flyer], ORIGIN, aim, { perp: 0.75, range: 15 }),
		).toBeNull();
	});

	it('excludes a candidate sitting exactly at the half-width', () => {
		// The comparison is strict (`perp < bestPerp`), so the boundary is a miss.
		const c = cand(1, 4, 0);
		const a = worldToScreen(0, 0);
		const s = c.screen!;
		const b = worldToScreen(10, 0);
		const nx = (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y);
		const ny = (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y);
		const perp = Math.abs((s.x - a.x) * ny - (s.y - a.y) * nx);
		expect(
			coneTarget(
				[c],
				ORIGIN,
				{ x: 10, y: 0 },
				{ halfPx: perp, range: 15 },
			),
		).toBeNull();
		expect(
			coneTarget(
				[c],
				ORIGIN,
				{ x: 10, y: 0 },
				{ halfPx: perp + 1e-6, range: 15 },
			),
		).toBe(1);
	});
});

describe('rayTarget', () => {
	const RAY = { perp: 0.75, range: 15 };

	it('returns null with no candidates', () => {
		expect(rayTarget([], ORIGIN, { x: 5, y: 0 }, RAY)).toBeNull();
	});

	it('returns null when the aim is degenerate', () => {
		expect(rayTarget([cand(1, 3, 0)], ORIGIN, ORIGIN, RAY)).toBeNull();
	});

	it('picks the nearest along the ray, not the closest to the line', () => {
		const near = cand(1, 3, 0.5);
		const farButDeadOn = cand(2, 9, 0);
		expect(
			rayTarget([farButDeadOn, near], ORIGIN, { x: 12, y: 0 }, RAY),
		).toBe(1);
	});

	it('ignores candidates behind the caster', () => {
		expect(
			rayTarget([cand(1, -4, 0)], ORIGIN, { x: 5, y: 0 }, RAY),
		).toBeNull();
	});

	it('ignores candidates beyond range', () => {
		const far = cand(1, 20, 0);
		expect(rayTarget([far], ORIGIN, { x: 25, y: 0 }, RAY)).toBeNull();
		expect(
			rayTarget([far], ORIGIN, { x: 25, y: 0 }, { perp: 0.75, range: 0 }),
		).toBe(1);
	});

	it('rejects candidates further than perp off the centerline', () => {
		const off = cand(1, 5, 2);
		expect(rayTarget([off], ORIGIN, { x: 10, y: 0 }, RAY)).toBeNull();
		expect(
			rayTarget([off], ORIGIN, { x: 10, y: 0 }, { perp: 3, range: 15 }),
		).toBe(1);
	});

	it('includes a candidate sitting exactly at the perp limit', () => {
		// This comparison is `> perp` (not `>=`), so the boundary is a hit —
		// the opposite of the cone's strict half-width.
		const c = cand(1, 5, 2);
		const perp = Math.abs(2 * 1 - 0 * 0) / 1; // dx*ny - dy*nx with aim +x
		expect(
			rayTarget([c], ORIGIN, { x: 10, y: 0 }, { perp, range: 15 }),
		).toBe(1);
	});

	it('counts a candidate with no sprite, unlike the cone', () => {
		const invisible: AimCandidate = { id: 1, tile: { x: 5, y: 0 } };
		expect(rayTarget([invisible], ORIGIN, { x: 10, y: 0 }, RAY)).toBe(1);
		expect(
			coneTarget([invisible], ORIGIN, { x: 10, y: 0 }, WIDE),
		).toBeNull();
	});
});
