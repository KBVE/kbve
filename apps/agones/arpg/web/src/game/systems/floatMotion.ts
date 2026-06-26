import type { Dir } from '@kbve/laser';
import type { TileXY } from '../iso';
import {
	MOVE_ACCEL,
	MOVE_FRICTION,
	STOP_SPEED,
	BODY_RADIUS,
	COLLISION_SKIN,
	MAX_MOVE_STEP,
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
	return { x: tileAt(s.pos.x), y: tileAt(s.pos.y) };
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
const expDecay = (rate: number, dt: number): number => Math.exp(-rate * dt);

export function stepFloat(
	s: FloatState,
	intent: TileXY,
	speed: number,
	isBlocked: IsBlocked,
	dtMs: number,
): void {
	const dt = Math.min(dtMs, 50) / 1000;
	const ix = intent.x;
	const iy = intent.y;
	const mag = Math.hypot(ix, iy);

	if (mag > 0) {
		const nx = ix / mag;
		const ny = iy / mag;
		const scale = Math.min(mag, 1);
		const targetVx = nx * speed * scale;
		const targetVy = ny * speed * scale;
		const response = 1 - expDecay(MOVE_ACCEL, dt);
		s.vel.x += (targetVx - s.vel.x) * response;
		s.vel.y += (targetVy - s.vel.y) * response;
	} else {
		const decay = expDecay(MOVE_FRICTION, dt);
		s.vel.x *= decay;
		s.vel.y *= decay;
		if (floatSpeed(s) < STOP_SPEED) {
			s.vel.x = 0;
			s.vel.y = 0;
		}
	}

	if (CENTERLINE_PULL > 0) applyCenterlinePull(s, isBlocked, dt);
	moveAxisSub(s, 'x', s.vel.x * dt, isBlocked);
	moveAxisSub(s, 'y', s.vel.y * dt, isBlocked);
}

function moveAxisSub(
	s: FloatState,
	axis: 'x' | 'y',
	delta: number,
	isBlocked: IsBlocked,
): boolean {
	if (delta === 0) return false;
	const steps = Math.max(1, Math.ceil(Math.abs(delta) / MAX_MOVE_STEP));
	const step = delta / steps;
	for (let i = 0; i < steps; i++) {
		if (moveAxis(s, axis, step, isBlocked)) return true;
	}
	return false;
}

const tileAt = (v: number): number => Math.floor(v + 0.5);

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
	const center = s.pos[other];
	const o0 = tileAt(center - BODY_RADIUS);
	const o1 = tileAt(center + BODY_RADIUS);

	for (let o = o0; o <= o1; o++) {
		const tx = axis === 'x' ? edgeTile : o;
		const ty = axis === 'x' ? o : edgeTile;
		if (!isBlocked(tx, ty)) continue;

		// Distinguish a flat wall face from a convex corner: the corner tile is
		// blocked but the tile orthogonally between the body's center row and it
		// is OPEN (the body is only clipping the tile's corner, not its face).
		const faceRow = tileAt(center);
		const cornerOnly =
			o !== faceRow &&
			!isBlocked(
				axis === 'x' ? edgeTile : faceRow,
				axis === 'x' ? faceRow : edgeTile,
			);

		if (cornerOnly) {
			// Round the corner: instead of stopping the axis, push the body
			// perpendicular away from the corner so the circle slides past it.
			// `o` is the corner row; nudge `other` toward the open side.
			const cornerEdge = o - Math.sign(o - faceRow) * 0.5; // near tile face
			const overlap =
				BODY_RADIUS - Math.abs(cornerEdge - center) + COLLISION_SKIN;
			if (overlap > 0) {
				s.pos[other] -= Math.sign(o - faceRow) * overlap;
			}
			continue; // let the axis move proceed — we slid around the corner
		}

		// Flat wall face: rest the circle just short of it and stop this axis.
		const wallFace = edgeTile - dir * 0.5;
		s.pos[axis] = wallFace - dir * (BODY_RADIUS + COLLISION_SKIN);
		s.vel[axis] = 0;
		return true;
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
	const sp = floatSpeed(s);
	if (sp < 0.01) return;
	const cx = tileAt(s.pos.x);
	const cy = tileAt(s.pos.y);
	const pull = CENTERLINE_PULL * dt;

	// Only assist the axis PERPENDICULAR to travel, and only in a true corridor
	// (walls on BOTH sides of that axis). This keeps the body off corridor walls
	// when walking down it, without yanking at open room edges where one side
	// just happens to border a wall.
	const movingX = Math.abs(s.vel.x) > Math.abs(s.vel.y);
	if (movingX) {
		if (isBlocked(cx, cy - 1) && isBlocked(cx, cy + 1)) {
			s.pos.y += (cy - s.pos.y) * pull;
		}
	} else {
		if (isBlocked(cx - 1, cy) && isBlocked(cx + 1, cy)) {
			s.pos.x += (cx - s.pos.x) * pull;
		}
	}
}

/**
 * Soft-correct the float position toward the server-authoritative tile. Small
 * drift is lerped away invisibly; a large divergence (teleport, desync, big
 * rubber-band) snaps to avoid a long visible slide. Keeps the client smooth
 * while the server stays the source of truth.
 */
export function reconcileFloat(s: FloatState, serverPos: TileXY): void {
	const dx = serverPos.x - s.pos.x;
	const dy = serverPos.y - s.pos.y;

	const dist = Math.hypot(dx, dy);
	if (dist > RECONCILE_SNAP_DIST) {
		s.pos.x = serverPos.x;
		s.pos.y = serverPos.y;
		s.vel.x = 0;
		s.vel.y = 0;
		return;
	}

	// A STOPPED body already on the server's own tile: hold position. The leftover
	// gap is pure sub-tile (same tile = gameplay-identical), and continuously
	// lerping it toward the server's resting sub-position visibly creeps the player
	// AFTER they release — the "moves when I stop" artifact (the old same-tile
	// guard here compared an int tile to a float pos, so it never fired). Movement
	// still reconciles below, so real drift never accumulates.
	const cur = floatTile(s);
	const onServerTile =
		cur.x === tileAt(serverPos.x) && cur.y === tileAt(serverPos.y);
	if (onServerTile && floatSpeed(s) < STOP_SPEED) return;

	// A full backward pull mid-run reads as rubber-banding, so while moving against
	// the correction we used to skip it entirely — but that lets drift pile up and
	// lurch the camera the instant you stop. Instead bleed it off gently and
	// continuously, so there's nothing left to snap on release.
	const movingAgainst =
		floatSpeed(s) > 0.05 && dx * s.vel.x + dy * s.vel.y < 0;
	const lerp = movingAgainst ? RECONCILE_LERP * 0.2 : RECONCILE_LERP;
	s.pos.x += dx * lerp;
	s.pos.y += dy * lerp;
}
