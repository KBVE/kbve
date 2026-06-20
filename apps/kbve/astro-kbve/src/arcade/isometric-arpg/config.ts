export const TILE_W = 64;
export const TILE_H = 32;

export const GRID_SIZE = 24;

export const MOVE_TWEEN_MS = 140;
export const HEARTBEAT_MS = 20000;

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

export const WS_URL_FALLBACK = 'wss://arpg.kbve.com/ws';

export function resolveWsUrl(): string {
	const env = import.meta.env.PUBLIC_ARPG_GAME_WS as string | undefined;
	return env && env.length > 0 ? env : WS_URL_FALLBACK;
}
