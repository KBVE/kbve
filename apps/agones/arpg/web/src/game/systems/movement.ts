import Phaser from 'phaser';
import { GameClient, type Facing } from '@kbve/laser';
import {
	WALK_SPEED,
	RUN_SPEED,
	SIM_DT_MS,
	ARRIVE_DIST,
	WAYPOINT_REACH,
	DEPTH_ENTITY_BASE,
} from '../config';
import { worldToScreen, screenToWorldF, tileDepth, type TileXY } from '../iso';
import {
	makeFloatState,
	stepFloat,
	floatTile,
	reconcileFloat,
	type FloatState,
} from './floatMotion';
import { DungeonField } from './dungeon';
import { findHierPath, type GateGraph } from './pathfind';
import { facingDegFromDelta } from '../entities/classes';
import { setClassPose, type EntityRefs } from '../entities/sprites';
import { syncShadow, placeNameplate } from './entityView';
import type { CombatState } from './combat';

/**
 * Local player kinematic state: the smooth float body, the active click route,
 * the server-synced predicted tile, and the move-send throttle bookkeeping.
 * This is the shared player model — combat/hud/inventory read floatState +
 * predicted off it.
 */
export interface MovementState {
	floatState: FloatState;
	// Click-move route: A* waypoints (smoothed), consumed front-to-back. Empty =
	// no active click move. Keyboard input clears it.
	movePath: TileXY[];
	// Server-synced tile the local player occupies (drives streaming + targeting).
	predicted: TileXY;
	wasMoving: boolean;
	// Monotonic client sim tick. Incremented once per FIXED step; stamped on each
	// Move so the server applies inputs FIFO one-per-tick in lockstep.
	tick: number;
	// Fixed-step accumulator (ms). tickLocalMotion drains it in SIM_DT_MS chunks so
	// the local sim integrates at the SAME cadence as the server — making the
	// reconcile replay reproduce it exactly (drift ~0, no deadzone needed).
	accumMs: number;
	// Float position BEFORE the most recent fixed step, for render interpolation
	// between fixed states (smooth 60fps over the 20Hz sim).
	prevPos: TileXY;
	// Ticks with no intent since the last move, to send a short stop tail so the
	// server's FIFO reliably receives the release before it starves.
	idleTicks: number;
	// True if the most recent fixed step had movement intent (drives pose).
	intending: boolean;
	// Last cardinal facing sent to the server, so face() only fires on change.
	lastSentFacing: Facing | null;
}

export function makeMovementState(start: TileXY): MovementState {
	return {
		floatState: makeFloatState(start),
		movePath: [],
		predicted: { ...start },
		wasMoving: false,
		tick: 0,
		accumMs: 0,
		prevPos: { ...start },
		idleTicks: 0,
		intending: false,
		lastSentFacing: null,
	};
}

export interface MovementDeps {
	scene: Phaser.Scene;
	client(): GameClient | null;
	dungeon(): DungeonField;
	gateGraph: GateGraph;
	isBlocked(x: number, y: number): boolean;
	// Movement intent off the central input router (context-gated), -1..1 per axis.
	moveAxisX(): number;
	moveAxisY(): number;
	// Walk tier (Shift held) vs run.
	walking(): boolean;
	combat: CombatState;
	refreshDungeon(tile: TileXY): void;
}

// Cap fixed steps consumed in one frame so a long stall (tab refocus / GC) doesn't
// spiral into a catch-up burst.
const MAX_STEPS_PER_FRAME = 5;
// Ticks to keep sending the stop intent after release, so the server FIFO gets the
// (0,0) before it would starve.
const MOVE_SEND_TAIL_TICKS = 4;

/**
 * Collapse a 16-direction facing degree (screen-space, 0=N CW) into the four
 * cardinal directions the wire protocol carries. The server only needs a coarse
 * facing for remote-player pose; the client keeps the full 16-dir locally.
 */
function cardinalFromDeg(deg: number): Facing {
	const d = ((deg % 360) + 360) % 360;
	if (d >= 315 || d < 45) return 'Up';
	if (d < 135) return 'Right';
	if (d < 225) return 'Down';
	return 'Left';
}

/** Send the cardinal aim to the server, but only when it changes. */
function sendFacing(
	st: MovementState,
	deps: MovementDeps,
	facing: Facing,
): void {
	if (facing === st.lastSentFacing) return;
	st.lastSentFacing = facing;
	deps.client()?.face(facing);
}

/**
 * Float-driven local movement: keyboard (held = continuous intent) or a click
 * destination feeds a world-tile intent vector into the float sim, which is then
 * rendered, animated (Run/Idle by speed), and synced to the server as cardinal
 * steps whenever the underlying tile changes.
 */
export function tickLocalMotion(
	st: MovementState,
	deps: MovementDeps,
	refs: EntityRefs,
	deltaMs: number,
): void {
	const walking = deps.walking();
	const speed = walking ? WALK_SPEED : RUN_SPEED;

	// Integrate the local sim at the SAME fixed cadence as the server (SIM_DT_MS),
	// draining an accumulator. One intent sample + one stamped Move + one tick per
	// step, so the server's FIFO and the reconcile replay reproduce this motion
	// EXACTLY — drift is ~0 and the reconcile barely moves the body.
	st.accumMs += deltaMs;
	let steps = 0;
	let intending = st.intending;
	while (st.accumMs >= SIM_DT_MS && steps < MAX_STEPS_PER_FRAME) {
		const intent = readIntent(st, deps);
		intending = Math.hypot(intent.x, intent.y) > 0;

		st.prevPos = { x: st.floatState.pos.x, y: st.floatState.pos.y };
		const prevTile = floatTile(st.floatState);
		stepFloat(st.floatState, intent, speed, deps.isBlocked, SIM_DT_MS);
		st.tick += 1;

		// One stamped intent per tick while moving, plus a short stop tail so the
		// server's FIFO reliably receives the release (0,0) before it starves.
		if (intending) st.idleTicks = 0;
		else st.idleTicks += 1;
		if (intending || st.idleTicks <= MOVE_SEND_TAIL_TICKS) {
			const mag = Math.hypot(intent.x, intent.y);
			const mx = intending ? Math.round((intent.x / mag) * 127) : 0;
			const my = intending ? Math.round((intent.y / mag) * 127) : 0;
			deps.client()?.move(mx, my, !walking, st.tick);
			st.wasMoving = intending;
		}

		// Stream the surface when the body enters a new tile.
		const tile = floatTile(st.floatState);
		if (tile.x !== prevTile.x || tile.y !== prevTile.y) {
			st.predicted = tile;
			deps.refreshDungeon(tile);
		}

		// Drop the click route once the FINAL tile is reached or overshot.
		if (st.movePath.length === 1) {
			const goal = st.movePath[0];
			const gdx = goal.x - st.floatState.pos.x;
			const gdy = goal.y - st.floatState.pos.y;
			const gdist = Math.hypot(gdx, gdy);
			const overshot =
				gdx * st.floatState.vel.x + gdy * st.floatState.vel.y < 0;
			if (gdist < ARRIVE_DIST || (overshot && gdist < 1))
				st.movePath = [];
		}

		st.accumMs -= SIM_DT_MS;
		steps++;
	}
	// A long frame (tab refocus / GC) would queue a spiral of catch-up steps;
	// clamp and drop the backlog so it doesn't lurch.
	if (steps >= MAX_STEPS_PER_FRAME) st.accumMs = 0;
	st.intending = intending;

	// Locomotion anim follows ACTIVE INTENT (latest step), not residual velocity:
	// the moment input stops the body flips to Idle while friction bleeds the slide.
	if (intending && deps.combat.bowShot?.busy) {
		deps.combat.bowShot.cancel();
	}
	const firing = deps.combat.bowShot?.busy ?? false;
	if (
		!firing &&
		refs.cls &&
		refs.sprite instanceof Phaser.GameObjects.Sprite
	) {
		if (intending) {
			setClassPose(
				refs.sprite,
				refs.cls,
				walking ? 'WalkForward' : 'Run',
				{ dx: st.floatState.vel.x, dy: st.floatState.vel.y },
				deps.scene,
			);
		} else if (
			refs.cls.state === 'Run' ||
			refs.cls.state === 'WalkForward'
		) {
			setClassPose(refs.sprite, refs.cls, 'Idle', undefined, deps.scene);
		}
	}

	// Standing still: turn the body toward the cursor so she's pre-aimed for a shot.
	if (!intending && !firing && refs.cls) {
		const ptr = deps.scene.input.activePointer;
		const aim = screenToWorldF(ptr.worldX, ptr.worldY);
		const dx = aim.x - st.floatState.pos.x;
		const dy = aim.y - st.floatState.pos.y;
		if (Math.hypot(dx, dy) > 0.05) {
			const deg = facingDegFromDelta(dx, dy);
			refs.cls.targetDeg = deg;
			sendFacing(st, deps, cardinalFromDeg(deg));
		}
	}

	// Render BETWEEN the last two fixed states by the leftover accumulator, so the
	// body glides smoothly at 60fps over the 20Hz sim (lags <= one step, ~50ms).
	const alpha = SIM_DT_MS > 0 ? st.accumMs / SIM_DT_MS : 0;
	const rx = st.prevPos.x + (st.floatState.pos.x - st.prevPos.x) * alpha;
	const ry = st.prevPos.y + (st.floatState.pos.y - st.prevPos.y) * alpha;
	renderFloat(refs, rx, ry);
}
/**
 * World-tile intent vector. Held keys win (and cancel any click route);
 * otherwise follow the A* path — steer toward the current waypoint, pop it on
 * arrival, and aim straight at the final tile (sub-unit intent near the end so
 * the body eases to a stop instead of overshooting).
 */
function readIntent(st: MovementState, deps: MovementDeps): TileXY {
	// Direction off the router's gated axes (WASD/arrows -> MoveLeft/Right/Up/Down),
	// so a Chat/Menu context zeroes movement without touching this code.
	const ix = deps.moveAxisX();
	const iy = deps.moveAxisY();
	if (ix !== 0 || iy !== 0) {
		st.movePath = [];
		const wx = ix + iy;
		const wy = iy - ix;
		const mag = Math.hypot(wx, wy) || 1;
		return { x: wx / mag, y: wy / mag };
	}

	while (st.movePath.length > 0) {
		const wp = st.movePath[0];
		const dx = wp.x - st.floatState.pos.x;
		const dy = wp.y - st.floatState.pos.y;
		const dist = Math.hypot(dx, dy);
		// Reached this waypoint — pop and aim at the next. Looser threshold for
		// intermediate waypoints so the body doesn't have to pass dead-center;
		// only the final tile eases to a precise stop.
		const last = st.movePath.length === 1;
		const reach = last ? ARRIVE_DIST : WAYPOINT_REACH;
		if (dist < reach) {
			st.movePath.shift();
			continue;
		}
		return { x: dx, y: dy };
	}
	return { x: 0, y: 0 };
}

/** Draw the local sprite at a (render-interpolated) fractional float position. */
function renderFloat(refs: EntityRefs, x: number, y: number): void {
	const p = worldToScreen(x, y);
	refs.sprite.setPosition(p.x, p.y + 8);
	refs.sprite.setDepth(DEPTH_ENTITY_BASE + tileDepth(x, y));
	syncShadow(refs);
	placeNameplate(refs);
}

/**
 * Replay unacked moves from the server-authoritative position to soft-correct
 * the float body without snapping. Seeds the replay with the server's reported
 * velocity so unacked inputs reproduce the authoritative coast.
 */
export function reconcilePlayer(
	st: MovementState,
	deps: MovementDeps,
	serverPos: TileXY,
	serverVel: TileXY,
	inputAck: number,
): void {
	const unacked = deps.client()?.ackMoves(inputAck) ?? [];
	const replay = makeFloatState(serverPos);
	replay.vel.x = serverVel.x;
	replay.vel.y = serverVel.y;
	for (const m of unacked) {
		const speed = m.run ? RUN_SPEED : WALK_SPEED;
		stepFloat(
			replay,
			{ x: m.mx / 127, y: m.my / 127 },
			speed,
			deps.isBlocked,
			SIM_DT_MS,
		);
	}
	reconcileFloat(st.floatState, replay.pos);
}

/**
 * Click-move: hierarchical route from the body's tile to the clicked tile. The
 * gate graph picks the room-to-room chunk route and tile A* refines each leg, so
 * long cross-dungeon clicks stay cheap and follow corridor centers instead of
 * straight-lining into a wall. No path = no move.
 */
export function startMoveTo(
	st: MovementState,
	deps: MovementDeps,
	tile: TileXY,
): void {
	if (!deps.client()) return;
	const start = floatTile(st.floatState);
	const path = findHierPath(
		start,
		tile,
		(x, y) => !deps.isBlocked(x, y),
		deps.gateGraph,
	);
	st.movePath = path ?? [];
}
