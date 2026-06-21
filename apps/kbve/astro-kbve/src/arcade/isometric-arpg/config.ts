export const TILE_W = 64;
export const TILE_H = 32;

export const GRID_SIZE = 24;

export const MOVE_TWEEN_MS = 140;
export const HEARTBEAT_MS = 20000;

// Idle<->Run state crossfade: a ghost sprite holds the outgoing anim and fades
// out while the live sprite fades in; the live anim's timeScale ramps from
// BLEND_TIMESCALE_FROM up to 1 so the flipbook spins up instead of snapping.
export const BLEND_MS = 200;
export const BLEND_TIMESCALE_FROM = 0.45;
// Idle->Run anticipation: brief vertical squash that recovers over the blend,
// selling a weight-shift into the step and masking flipbook pose mismatch.
export const BLEND_SQUASH = 0.92;

export const DEPTH_TILE = 0;
export const DEPTH_ENTITY_BASE = 10000;
export const DEPTH_UI = 100000;

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
