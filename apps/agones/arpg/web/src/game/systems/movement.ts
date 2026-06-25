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
	moveSendAccumMs: number;
	wasMoving: boolean;
	// Last cardinal facing sent to the server, so face() only fires on change.
	lastSentFacing: Facing | null;
}

export function makeMovementState(start: TileXY): MovementState {
	return {
		floatState: makeFloatState(start),
		movePath: [],
		predicted: { ...start },
		moveSendAccumMs: 0,
		wasMoving: false,
		lastSentFacing: null,
	};
}

export interface MovementDeps {
	scene: Phaser.Scene;
	client(): GameClient | null;
	dungeon(): DungeonField;
	gateGraph: GateGraph;
	isBlocked(x: number, y: number): boolean;
	cursors: Phaser.Types.Input.Keyboard.CursorKeys;
	wasd: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
	combat: CombatState;
	refreshDungeon(tile: TileXY): void;
}

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
	const intent = readIntent(st, deps);
	const prevTile = floatTile(st.floatState);

	// Walk tier while Shift is held; run otherwise. Each tier's body speed is
	// tuned to its anim's stride, so feet don't slide at either pace.
	const walking = deps.cursors.shift?.isDown ?? false;
	const speed = walking ? WALK_SPEED : RUN_SPEED;
	stepFloat(st.floatState, intent, speed, deps.isBlocked, deltaMs);

	// Locomotion anim follows ACTIVE INTENT, not residual velocity: the moment
	// input stops the body flips to Idle, even though friction is still bleeding
	// the leftover velocity to a slide-stop. Keying off velocity instead left a
	// few frames of run-in-place during decel.
	const intending = Math.hypot(intent.x, intent.y) > 0;
	// Moving cancels an in-progress shot: switch straight to Run instead of
	// sliding in the bow pose. If the cancel lands before the release frame the
	// arrow is suppressed; if it already loosed, only the recover is cut.
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

	// While standing still (not moving, not firing), track the cursor: turn the
	// body toward where the player is aiming so she's pre-aimed before a shot.
	// tickClassFacing lerps targetDeg, so this reads as a natural turn.
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

	renderFloat(st, refs);

	// Keep the server roughly in sync: emit a cardinal step toward whatever new
	// tile the float body has entered. The server stays authoritative;
	// reconcileFloat soft-corrects any drift on the next snapshot.
	const tile = floatTile(st.floatState);
	if (tile.x !== prevTile.x || tile.y !== prevTile.y) {
		st.predicted = tile;
		deps.refreshDungeon(tile);
	}

	st.moveSendAccumMs += deltaMs;
	// Flush a release (moving -> idle) immediately instead of waiting for the
	// 50ms cadence, so the server stops powering the held intent a throttle
	// window sooner — cuts the on-stop over-travel the client can't predict.
	const idleNow = intent.x === 0 && intent.y === 0;
	const releaseEdge = st.wasMoving && idleNow;
	if (releaseEdge || st.moveSendAccumMs >= 50) {
		st.moveSendAccumMs = 0;
		const mag = Math.hypot(intent.x, intent.y);
		const moving = mag > 0;
		if (moving || st.wasMoving) {
			const mx = moving ? Math.round((intent.x / mag) * 127) : 0;
			const my = moving ? Math.round((intent.y / mag) * 127) : 0;
			deps.client()?.move(mx, my, !walking);
		}
		st.wasMoving = moving;
	}

	// Drop the click route once the FINAL tile is reached or overshot, so the
	// float never orbits the goal stuck in Run (intermediate waypoints are
	// consumed in readIntent).
	if (st.movePath.length === 1) {
		const goal = st.movePath[0];
		const dx = goal.x - st.floatState.pos.x;
		const dy = goal.y - st.floatState.pos.y;
		const dist = Math.hypot(dx, dy);
		const overshot =
			dx * st.floatState.vel.x + dy * st.floatState.vel.y < 0;
		if (dist < ARRIVE_DIST || (overshot && dist < 1)) {
			st.movePath = [];
		}
	}
}

/**
 * World-tile intent vector. Held keys win (and cancel any click route);
 * otherwise follow the A* path — steer toward the current waypoint, pop it on
 * arrival, and aim straight at the final tile (sub-unit intent near the end so
 * the body eases to a stop instead of overshooting).
 */
function readIntent(st: MovementState, deps: MovementDeps): TileXY {
	const { cursors, wasd } = deps;
	const ix =
		(cursors.right.isDown || wasd.right.isDown ? 1 : 0) -
		(cursors.left.isDown || wasd.left.isDown ? 1 : 0);
	const iy =
		(cursors.down.isDown || wasd.down.isDown ? 1 : 0) -
		(cursors.up.isDown || wasd.up.isDown ? 1 : 0);
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

/** Draw the local sprite at its fractional float position. */
function renderFloat(st: MovementState, refs: EntityRefs): void {
	const p = worldToScreen(st.floatState.pos.x, st.floatState.pos.y);
	refs.sprite.setPosition(p.x, p.y + 8);
	refs.sprite.setDepth(
		DEPTH_ENTITY_BASE + tileDepth(st.floatState.pos.x, st.floatState.pos.y),
	);
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
