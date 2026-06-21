import type { Dir } from '@kbve/laser';
import type { TileXY } from '../iso';
import {
	MOVE_ACCEL,
	MOVE_FRICTION,
	BODY_RADIUS,
	COLLISION_SKIN,
	CENTERLINE_PULL,
	RECONCILE_LERP,
	RECONCILE_SNAP_DIST,
} from '../config';

export type IsBlocked = (x: number, y: number) => boolean;

/**
 * Continuous client-side motion in fractional world-tile units. The float
 * position is what gets rendered; the integer tile under it (round of x/y)
 * feeds collision and the cardinal wire step. Velocity accelerates toward the
 * input intent and decays by friction when released, so starts/stops ease
 * instead of snapping — the source of the natural feel over a grid lock.
 */
export interface FloatState {
	pos: TileXY;
	vel: TileXY;
}

export function makeFloatState(start: TileXY): FloatState {
	return { pos: { x: start.x, y: start.y }, vel: { x: 0, y: 0 } };
}

/** Integer tile the float position currently occupies. */
export function floatTile(s: FloatState): TileXY {
	return { x: Math.round(s.pos.x), y: Math.round(s.pos.y) };
}

/**
 * Cardinal wire step from one tile to an adjacent one. Diagonal tile crossings
 * resolve to the dominant axis; returns null for no movement. Keeps the
 * cardinal-only server protocol fed as the float body crosses tile lines.
 */
export function tileStepDir(from: TileXY, to: TileXY): Dir | null {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (dx === 0 && dy === 0) return null;
	if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'Right' : 'Left';
	return dy > 0 ? 'Down' : 'Up';
}

/** Current speed in tiles/sec (magnitude of velocity). */
export function floatSpeed(s: FloatState): number {
	return Math.hypot(s.vel.x, s.vel.y);
}

/**
 * Advance the float sim one frame. `intent` is a (usually unit-ish) world-tile
 * direction the player wants to move (0,0 = none); `speed` is the active
 * locomotion tier (WALK_SPEED / RUN_SPEED). Velocity steers toward intent*speed
 * at MOVE_ACCEL, or bleeds off by MOVE_FRICTION when idle; the step is then
 * clamped per-axis against blocked tiles so the body slides along walls instead
 * of sticking. `dtMs` is the frame delta in milliseconds.
 */
export function stepFloat(
	s: FloatState,
	intent: TileXY,
	speed: number,
	isBlocked: IsBlocked,
	dtMs: number,
): void {
	const dt = Math.min(dtMs, 50) / 1000; // clamp huge frame gaps
	const mag = Math.hypot(intent.x, intent.y);

	if (mag > 0) {
		const nx = intent.x / mag;
		const ny = intent.y / mag;
		// A sub-unit intent magnitude scales the target speed, so a click-move
		// eases into its destination (intent shrinks as the body nears it)
		// instead of charging at full speed and orbiting the goal.
		const scale = Math.min(mag, 1);
		const targetVx = nx * speed * scale;
		const targetVy = ny * speed * scale;
		const k = Math.min(MOVE_ACCEL * dt, 1);
		s.vel.x += (targetVx - s.vel.x) * k;
		s.vel.y += (targetVy - s.vel.y) * k;
	} else {
		const decay = Math.max(0, 1 - MOVE_FRICTION * dt);
		s.vel.x *= decay;
		s.vel.y *= decay;
		if (floatSpeed(s) < 0.01) {
			s.vel.x = 0;
			s.vel.y = 0;
		}
	}

	// Narrow-passage centerline pull (computed before moving so it reads the
	// pre-move neighbourhood), then per-axis circle-vs-wall resolution.
	applyCenterlinePull(s, isBlocked, dt);

	// Wall-slide WITHOUT losing speed: if one axis is blocked, the velocity it
	// would have spent into the wall is redirected along the open (tangent)
	// axis, so grazing a wall while running keeps full pace instead of dragging.
	const speedBefore = floatSpeed(s);
	const blockedX = moveAxis(s, 'x', s.vel.x * dt, isBlocked);
	const blockedY = moveAxis(s, 'y', s.vel.y * dt, isBlocked);

	if (blockedX !== blockedY && speedBefore > 0.01) {
		const openAxis: 'x' | 'y' = blockedX ? 'y' : 'x';
		const openSpeed = Math.abs(s.vel[openAxis]);
		if (openSpeed > 0.001) {
			// Re-scale the surviving axis up to the pre-collision speed and
			// re-advance the leftover distance along the wall this same frame.
			const sign = Math.sign(s.vel[openAxis]);
			const extra = (speedBefore - openSpeed) * dt;
			s.vel[openAxis] = sign * speedBefore;
			moveAxis(s, openAxis, sign * extra, isBlocked);
		}
	}
}

/** Tile that a world coordinate falls in (tile centers on integers). */
const tileAt = (v: number): number => Math.round(v);

/**
 * Move one axis treating the player as a circle of BODY_RADIUS, not a point.
 * The leading edge of the circle is tested against every tile row the circle
 * spans on the other axis; hitting a blocked tile clamps the position so the
 * circle rests a hair off the wall (keeps a gap — no wall-hugging) and zeroes
 * only that axis's velocity. Returns true if a wall stopped the move (so the
 * caller can redirect the lost speed along the open axis).
 */
function moveAxis(
	s: FloatState,
	axis: 'x' | 'y',
	delta: number,
	isBlocked: IsBlocked,
): boolean {
	if (delta === 0) return false;
	const other: 'x' | 'y' = axis === 'x' ? 'y' : 'x';
	const target = s.pos[axis] + delta;
	const dir = Math.sign(delta);

	// Leading edge of the circle along the move axis.
	const edge = target + dir * BODY_RADIUS;
	const edgeTile = tileAt(edge);

	// Tile rows the circle covers on the perpendicular axis.
	const o0 = tileAt(s.pos[other] - BODY_RADIUS);
	const o1 = tileAt(s.pos[other] + BODY_RADIUS);

	for (let o = o0; o <= o1; o++) {
		const tx = axis === 'x' ? edgeTile : o;
		const ty = axis === 'x' ? o : edgeTile;
		if (isBlocked(tx, ty)) {
			// Rest the circle just short of the wall face (tile face at ±0.5).
			const wallFace = edgeTile - dir * 0.5;
			s.pos[axis] = wallFace - dir * (BODY_RADIUS + COLLISION_SKIN);
			s.vel[axis] = 0;
			return true;
		}
	}
	s.pos[axis] = target;
	return false;
}

/**
 * In a passage only as wide as the body, nudge velocity toward the passage
 * centerline so the player funnels through doorways/corridors instead of
 * scraping an edge. Checks the perpendicular neighbours of the current tile: if
 * one side is wall and the other open, steer away from the wall; the pull is
 * gentle so the player keeps full directional control.
 */
function applyCenterlinePull(
	s: FloatState,
	isBlocked: IsBlocked,
	dt: number,
): void {
	if (floatSpeed(s) < 0.01) return;
	const cx = tileAt(s.pos.x);
	const cy = tileAt(s.pos.y);
	const pull = CENTERLINE_PULL * dt;

	// Horizontal confinement (wall on exactly one side) -> ease toward the tile
	// center on X so the body rides the passage middle.
	if (isBlocked(cx - 1, cy) !== isBlocked(cx + 1, cy)) {
		s.pos.x += (cx - s.pos.x) * pull;
	}
	// Vertical confinement -> ease toward center on Y.
	if (isBlocked(cx, cy - 1) !== isBlocked(cx, cy + 1)) {
		s.pos.y += (cy - s.pos.y) * pull;
	}
}

/**
 * Soft-correct the float position toward the server-authoritative tile. Small
 * drift is lerped away invisibly; a large divergence (teleport, desync, big
 * rubber-band) snaps to avoid a long visible slide. Keeps the client smooth
 * while the server stays the source of truth.
 */
export function reconcileFloat(s: FloatState, serverTile: TileXY): void {
	const dx = serverTile.x - s.pos.x;
	const dy = serverTile.y - s.pos.y;
	const dist = Math.hypot(dx, dy);
	if (dist > RECONCILE_SNAP_DIST) {
		s.pos.x = serverTile.x;
		s.pos.y = serverTile.y;
		s.vel.x = 0;
		s.vel.y = 0;
		return;
	}
	s.pos.x += dx * RECONCILE_LERP;
	s.pos.y += dy * RECONCILE_LERP;
}
