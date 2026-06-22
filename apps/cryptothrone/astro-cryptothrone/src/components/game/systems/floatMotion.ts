import type { Dir } from '@kbve/laser';
import type { TileXY } from './netSync';

export const WALK_SPEED = 3.4;
export const RUN_SPEED = 6.6;
export const MOVE_ACCEL = 18;
export const MOVE_FRICTION = 60;
export const STOP_SPEED = 1.5;
export const MAX_MOVE_STEP = 0.2;
export const BODY_RADIUS = 0.34;
export const COLLISION_SKIN = 0.01;
export const CENTERLINE_PULL = 0;
export const RECONCILE_LERP = 0.25;
export const RECONCILE_SNAP_DIST = 6;
export const ARRIVE_DIST = 0.15;
export const WAYPOINT_REACH = 0.6;
export const SIM_TICK_HZ = 20;
export const SIM_DT_MS = 1000 / SIM_TICK_HZ;

export type IsBlocked = (x: number, y: number) => boolean;

export interface FloatState {
	pos: TileXY;
	vel: TileXY;
}

export function makeFloatState(start: TileXY): FloatState {
	return { pos: { x: start.x, y: start.y }, vel: { x: 0, y: 0 } };
}

const tileAt = (v: number): number => Math.floor(v + 0.5);

export function floatTile(s: FloatState): TileXY {
	return { x: tileAt(s.pos.x), y: tileAt(s.pos.y) };
}

export function tileStepDir(from: TileXY, to: TileXY): Dir | null {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (dx === 0 && dy === 0) return null;
	if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'Right' : 'Left';
	return dy > 0 ? 'Down' : 'Up';
}

export function floatSpeed(s: FloatState): number {
	return Math.hypot(s.vel.x, s.vel.y);
}

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

	const edge = target + dir * BODY_RADIUS;
	const edgeTile = tileAt(edge);

	const center = s.pos[other];
	const o0 = tileAt(center - BODY_RADIUS);
	const o1 = tileAt(center + BODY_RADIUS);

	for (let o = o0; o <= o1; o++) {
		const tx = axis === 'x' ? edgeTile : o;
		const ty = axis === 'x' ? o : edgeTile;
		if (!isBlocked(tx, ty)) continue;

		const faceRow = tileAt(center);
		const cornerOnly =
			o !== faceRow &&
			!isBlocked(
				axis === 'x' ? edgeTile : faceRow,
				axis === 'x' ? faceRow : edgeTile,
			);

		if (cornerOnly) {
			const cornerEdge = o - Math.sign(o - faceRow) * 0.5;
			const overlap =
				BODY_RADIUS - Math.abs(cornerEdge - center) + COLLISION_SKIN;
			if (overlap > 0) {
				s.pos[other] -= Math.sign(o - faceRow) * overlap;
			}
			continue;
		}

		const wallFace = edgeTile - dir * 0.5;
		s.pos[axis] = wallFace - dir * (BODY_RADIUS + COLLISION_SKIN);
		s.vel[axis] = 0;
		return true;
	}
	s.pos[axis] = target;
	return false;
}

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

export function reconcileFloat(s: FloatState, serverPos: TileXY): void {
	const dx = serverPos.x - s.pos.x;
	const dy = serverPos.y - s.pos.y;

	if (floatSpeed(s) > 0.05 && dx * s.vel.x + dy * s.vel.y < 0) return;

	const dist = Math.hypot(dx, dy);
	if (dist < 0.001) return;
	if (dist > RECONCILE_SNAP_DIST) {
		s.pos.x = serverPos.x;
		s.pos.y = serverPos.y;
		s.vel.x = 0;
		s.vel.y = 0;
		return;
	}
	s.pos.x += dx * RECONCILE_LERP;
	s.pos.y += dy * RECONCILE_LERP;
}
