export const TILE_W = 64;
export const TILE_H = 32;

export const GRID_SIZE = 24;

// Procedural endless dungeon: a seeded room-corridor graph streamed in chunks
// around the player. DUNGEON_SEED makes the layout reproducible (and later
// server-matchable); DUNGEON_RADIUS is how many chunks out from the player's
// chunk stay generated/rendered.
export const DUNGEON_SEED = 0x5eed1;
export const DUNGEON_RADIUS = 2;

// Distance fog is keyed to zoom: full when zoomed out (the streamed void edge is
// visible) and gone when zoomed in (tight view, no boundary to hide).
export const FOG_ZOOM_OUT = 0.7; // at/below this zoom, fog is at full strength
export const FOG_ZOOM_IN = 1.1; // at/above this zoom, no fog
export const FOG_MAX_STRENGTH = 0.6; // vignette strength when fully fogged

export const MOVE_TWEEN_MS = 140;
export const HEARTBEAT_MS = 20000;

// Continuous float motion (client-side). Position is fractional world-tile
// units; the integer tile underneath drives collision + the cardinal wire step.
// Two locomotion tiers, each tuned so the body speed matches its anim's stride
// (no foot-sliding): WALK (slower, WalkForward sheet) and RUN (faster, Run).
export const WALK_SPEED = 3.4; // tiles/sec, matches WalkForward stride
export const RUN_SPEED = 6.6; // tiles/sec, matches Run stride
export const MOVE_ACCEL = 16; // velocity steer rate toward intent
export const MOVE_FRICTION = 14; // velocity decay rate when no input
// Player collides as a circle, not a point: keeps a gap off walls (no hugging),
// slides along surfaces, and rounds corners instead of catching the tile edge.
export const BODY_RADIUS = 0.34; // tiles — circle half-width
export const COLLISION_SKIN = 0.01; // tiny gap kept off the wall face
// Soft funnel toward a narrow passage's centerline so room->door->room flows.
export const CENTERLINE_PULL = 6; // higher = snappier centering in passages
// Soft reconciliation of the float toward the server-authoritative tile.
export const RECONCILE_LERP = 0.12; // per-snapshot pull toward server tile
export const RECONCILE_SNAP_DIST = 2.5; // tiles of drift before a hard snap
export const ARRIVE_DIST = 0.15; // tiles from a click target counted as arrived
export const WAYPOINT_REACH = 0.6; // looser reach for intermediate A* waypoints

// Idle<->Run state crossfade: a ghost sprite holds the outgoing anim and fades
// out while the live sprite fades in; the live anim's timeScale ramps from
// BLEND_TIMESCALE_FROM up to 1 so the flipbook spins up instead of snapping.
// Facing turn curve: per-frame lerp factor pulling the visual facing angle
// toward the movement target. Lower = lazier, smoother arcs; 1 = instant snap.
export const TURN_LERP = 0.22;

export const BLEND_MS = 110;
export const BLEND_TIMESCALE_FROM = 0.45;
// Idle->Run anticipation: brief vertical squash that recovers over the blend,
// selling a weight-shift into the step and masking flipbook pose mismatch.
export const BLEND_SQUASH = 0.92;

export const DEPTH_TILE = 0;
export const DEPTH_ENTITY_BASE = 10000;
export const DEPTH_UI = 100000;

// Fake contact shadow: a flattened dark ellipse on the ground under each
// character. Sits just above the floor but below entities so it never occludes
// a body, and tracks the sprite's ground point as it moves.

export const COLORS = {
	background: '#10131c',
	tileFill: 0x2a3142,
	tileStroke: 0x3c465c,
	tileHover: 0x4c5a78,
	player: 0x6ea8ff,
	enemy: 0xf87171,
	npc: 0xfcd34d,
} as const;

export const GROUND_TEXTURE_KEY = 'arpg-ground';
export const GROUND_TEXTURE_PATH = '/assets/arcade/arpg/ground.png';

// Offline debug: when no server connects, spawn a locally-driven ranger so the
// character renders and is controllable without a live arpg-server.
export const DEBUG_LOCAL_PLAYER = true;
export const DEBUG_SPAWN_TILE = { x: 12, y: 12 };

export const WS_URL_FALLBACK = 'wss://arpg.kbve.com/ws';

export function resolveWsUrl(): string {
	const env = import.meta.env.PUBLIC_ARPG_GAME_WS as string | undefined;
	return env && env.length > 0 ? env : WS_URL_FALLBACK;
}
