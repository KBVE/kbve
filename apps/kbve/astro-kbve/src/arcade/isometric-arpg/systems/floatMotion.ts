import type { Dir } from '@kbve/laser';
import type { TileXY } from '../iso';
import {
	MOVE_ACCEL,
	MOVE_FRICTION,
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

	moveAxis(s, 'x', s.vel.x * dt, isBlocked);
	moveAxis(s, 'y', s.vel.y * dt, isBlocked);
}

/** Move one axis, cancelling that axis's velocity if the target tile blocks. */
function moveAxis(
	s: FloatState,
	axis: 'x' | 'y',
	delta: number,
	isBlocked: IsBlocked,
): void {
	if (delta === 0) return;
	const next = { x: s.pos.x, y: s.pos.y };
	next[axis] += delta;
	const tx = Math.round(next.x);
	const ty = Math.round(next.y);
	if (isBlocked(tx, ty)) {
		s.vel[axis] = 0;
		return;
	}
	s.pos[axis] = next[axis];
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
