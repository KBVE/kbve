import { makeWsResolver, type ChatConfig } from '@kbve/laser';

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

// Server sim cadence — must match simgrid SIM_TICK_HZ. Input replay during
// reconciliation steps the float body at this fixed dt so it matches the
// server's per-tick advance exactly (live frames use the variable frame dt).
export const SIM_TICK_HZ = 20;
export const SIM_DT_MS = 1000 / SIM_TICK_HZ;

// Continuous float motion (client-side). Position is fractional world-tile
// units; the integer tile underneath drives collision + the cardinal wire step.
// Two locomotion tiers, each tuned so the body speed matches its anim's stride
// (no foot-sliding): WALK (slower, WalkForward sheet) and RUN (faster, Run).
export const WALK_SPEED = 3.4; // tiles/sec, matches WalkForward stride
export const RUN_SPEED = 6.6; // tiles/sec, matches Run stride
// Piloting cruise multiplier — MUST match PILOT_SPEED_MULT in simgrid float_move.rs
// so client prediction and the server agree on ship travel.
export const PILOT_SPEED_MULT = 2.3;
// Ship handling (momentum feel) — MUST match PILOT_ACCEL/PILOT_FRICTION in float_move.rs.
export const PILOT_ACCEL = 4.0;
export const PILOT_FRICTION = 2.5;
export const MOVE_ACCEL = 18; // velocity steer rate toward intent
export const MOVE_FRICTION = 60; // velocity decay rate when no input
export const STOP_SPEED = 1.5; // speed below which a released body snaps to rest
export const MAX_MOVE_STEP = 0.2; // tiles per collision substep
// Player collides as a circle, not a point: keeps a gap off walls (no hugging),
// slides along surfaces, and rounds corners instead of catching the tile edge.
export const BODY_RADIUS = 0.34; // tiles — circle half-width
export const COLLISION_SKIN = 0.01; // tiny gap kept off the wall face
export const PROBE_AHEAD = 0.04; // lookahead past the radius for intent deflection
// Optional funnel toward a corridor centerline. OFF by default (0) — intent
// deflection + circle-slide already keep the body off walls without it; it read
// as magnetised. Raise to ~1.5 to re-enable a gentle doorway funnel.
export const CENTERLINE_PULL = 0;
// Soft reconciliation of the float toward the server-authoritative tile.
export const RECONCILE_LERP = 0.25; // per-snapshot pull toward server pos
export const RECONCILE_SNAP_DIST = 6; // tiles of drift before a hard snap
export const ARRIVE_DIST = 0.15; // tiles from a click target counted as arrived
export const WAYPOINT_REACH = 0.6; // looser reach for intermediate A* waypoints

// Idle<->Run state crossfade: a ghost sprite holds the outgoing anim and fades
// out while the live sprite fades in; the live anim's timeScale ramps from
// BLEND_TIMESCALE_FROM up to 1 so the flipbook spins up instead of snapping.
// Facing turn curve: per-frame lerp factor pulling the visual facing angle
// toward the movement target. Lower = lazier, smoother arcs; 1 = instant snap.
export const TURN_LERP = 0.15;

export const BLEND_MS = 110;
export const BLEND_TIMESCALE_FROM = 0.45;
// Idle->Run anticipation: brief vertical squash that recovers over the blend,
// selling a weight-shift into the step and masking flipbook pose mismatch.
export const BLEND_SQUASH = 0.92;

export const DEPTH_TILE = 0;
export const DEPTH_ENTITY_BASE = 10000;
export const DEPTH_PROJECTILE = 90000; // arrows fly above entities, below UI
export const DEPTH_UI = 100000;

// Bow combat. Attack_Bow IS the full nock-pull-loose animation (Draw_Bow is the
// bow-equip pose, not the shot). The arrow leaves on frame 14 (1-based) — frame
// 13 is the last pull, 14 is the loose. The release delay is derived from the
// Attack anim's frameRate so it stays correct if the rate changes. Travels at
// ARROW_SPEED; the player can't re-fire until the shot resolves. Local-only for
// now — damage is faked client-side until the server combat path is wired.
export const BOW_RELEASE_FRAME = 14; // 1-based Attack frame the arrow looses on
export const BOW_RECOVER_MS = 160; // hold the follow-through before idle
export const BOW_MUZZLE_OFFSET = 0.55; // tiles forward of the body the arrow leaves
// West-facing poses (sheet 247..315 — she faces screen-left and holds the bow
// further out) need extra forward offset or the arrow spawns inside the body.
export const BOW_MUZZLE_OFFSET_WEST = 0.45; // added on top for the west band
export const BOW_MUZZLE_HEIGHT = 38; // px up from the ground = bow height
export const ARROW_SPEED = 18; // tiles/sec arrow travel
// MUST equal the server's combat::BOW_RANGE. The server resolves a bow shot with
// a line_cast bounded to BOW_RANGE, so a target past it is rejected — if the
// arrow flew/acquired farther than that, shots that visually connected dealt no
// damage. Bump both together to lengthen the bow.
export const ARROW_MAX_RANGE = 8; // tiles (= server combat::BOW_RANGE)
export const ARROW_DMG = 14; // placeholder local damage

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

// Asset base prefix. Empty by default → art loads from the site root
// (`/assets/arcade/arpg/...`), correct for kbve.com/arcade/arpg. The Discord
// Activity proxies the portal root to /discord/arpg/, so the embed sets this to
// a URL-mapping prefix (e.g. `/arpg-assets`, mapped to kbve.com) so the absolute
// art paths resolve back to the real site origin through the proxy.
let assetBase = '';

export function setArpgAssetBase(base: string): void {
	assetBase = base.replace(/\/$/, '');
}

/** Prefix an absolute site asset path with the active asset base. */
export function arpgAsset(path: string): string {
	return `${assetBase}${path}`;
}

export const GROUND_TEXTURE_KEY = 'arpg-ground';
export const GROUND_TEXTURE_PATH = '/assets/arcade/arpg/ground.png';

// z is elevation: z=0 is the grass surface (spawn/overworld), z>0 is above-ground
// (city/towers — future), and the carved dungeon is UNDERGROUND at z<0 (deeper =
// more negative). Floors at z>=0 are open grassland: grass ground, no walls, all
// walkable. Mirrors the server gate in arpg_dungeon::is_floor. Base layer for now.
export const SURFACE_MIN_Z = 0; // z >= this = open grass surface/overworld

export const BIOMES = ['meadow', 'spring', 'forest', 'wetland'] as const;
export type BiomeId = (typeof BIOMES)[number];
export const biomeTextureKey = (b: BiomeId) => `arpg-biome-${b}`;
export const biomeTexturePath = (b: BiomeId) =>
	`/assets/arcade/arpg/textures/grass/biome_${b}.webp`;

// Per-pixel ground shader: one screen quad unprojects each surface pixel to a
// world tile, samples the biome field + atlases and blends biomes per-pixel for
// seamless borders. Replaces the per-chunk biome TileSprite on the surface; the
// chunk-atlas path stays for dungeon floors and as a fallback when this is off.
export const USE_GROUND_SHADER = true;

// React HUD debug panel: shows fps + current tile alongside the compass/vitals.
// Flip off for release; the compass + vitals panels render regardless.
export const DEBUG_HUD = true;

export const WS_URL_FALLBACK = 'wss://arpg.kbve.com/ws';

export const resolveWsUrl = makeWsResolver(
	import.meta.env.PUBLIC_ARPG_GAME_WS,
	WS_URL_FALLBACK,
);

// Realm chat over the shared irc-gateway (laser RealmChatClient). The gateway
// routes `?game=arpg` to #general (GAME_PROFILES in irc-gateway minechat.rs).
// Only these per-game values differ — the client + wire live in @kbve/laser.
let chatUrlOverride: string | null = null;

export function setArpgChatUrl(url: string): void {
	chatUrlOverride = url;
}

const resolveChatEnv = makeWsResolver(
	import.meta.env.PUBLIC_ARPG_CHAT_WS,
	'wss://chat.kbve.com/gamechat',
);

export const ARPG_CHAT: ChatConfig = {
	game: 'arpg',
	channel: '#general',
	resolveUrl: () => chatUrlOverride ?? resolveChatEnv(),
};
