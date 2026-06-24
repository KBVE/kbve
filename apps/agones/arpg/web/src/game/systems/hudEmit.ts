import Phaser from 'phaser';
import { EntityStore } from '@kbve/laser';
import { facingDegFromDelta } from '../entities/classes';
import { floatTile, type FloatState } from './floatMotion';
import { DungeonField } from './dungeon';
import { emitHud, type HudMap } from './hud';
import type { EntityRefs } from '../entities/sprites';
import type { TileXY } from '../iso';

const HUD_MAP_SIZE = 33;

/**
 * Throttle accumulator + cached compass heading and minimap window for the
 * React HUD emit. The minimap buffer is reused between tile crossings so the
 * 15 Hz emit stays cheap.
 */
export interface HudState {
	accum: number;
	// Last movement heading (screen deg, 0=N CW); held while idle so the compass
	// needle doesn't snap back when the player stops.
	headingDeg: number;
	map: HudMap | null;
	mapTile: TileXY | null;
}

export function makeHudState(): HudState {
	return { accum: 0, headingDeg: 0, map: null, mapTile: null };
}

/** Invalidate the cached minimap window (floor change / teleport). */
export function resetHudMap(st: HudState): void {
	st.map = null;
	st.mapTile = null;
}

export interface HudEmitDeps {
	scene: Phaser.Scene;
	store: EntityStore<EntityRefs>;
	floatState: FloatState;
	dungeon: DungeonField;
	myEid: number;
	surface: boolean;
	playerName: string;
}

/**
 * Push player vitals + the movement-driven compass heading to the React HUD
 * over the laser event bus, throttled to ~15 Hz. The compass tracks the float
 * body's VELOCITY (where the character is actually walking), not the cursor —
 * heading holds its last value while standing still so the needle doesn't snap
 * back to north on every stop.
 */
export function tickHud(
	st: HudState,
	deps: HudEmitDeps,
	deltaMs: number,
): void {
	st.accum += deltaMs;
	if (st.accum < 66) return;
	st.accum = 0;

	const vel = deps.floatState.vel;
	const moving = Math.hypot(vel.x, vel.y) > 0.05;
	if (moving) st.headingDeg = facingDegFromDelta(vel.x, vel.y);

	const tile = floatTile(deps.floatState);
	const maxHp = deps.store.maxHp(deps.myEid);
	emitHud({
		name: deps.playerName,
		hp: deps.store.hp(deps.myEid),
		maxHp,
		mp: maxHp,
		maxMp: maxHp,
		ep: maxHp,
		maxEp: maxHp,
		sp: maxHp,
		maxSp: maxHp,
		headingDeg: st.headingDeg,
		moving,
		fps: Math.round(deps.scene.game.loop.actualFps),
		tile,
		map: sampleHudMap(st, tile, deps.dungeon, deps.surface),
	});
}

/**
 * Sample a square dungeon window centered on the player into a floor bitset for
 * the minimap — rooms + the carved corridor paths between them. Rebuilt only
 * when the player crosses a tile (the layout is static between steps), reusing
 * the cached buffer otherwise to keep the 15 Hz emit cheap.
 */
export function sampleHudMap(
	st: HudState,
	tile: TileXY,
	dungeon: DungeonField,
	surface: boolean,
): HudMap {
	const size = HUD_MAP_SIZE;
	if (
		st.map &&
		st.mapTile &&
		st.mapTile.x === tile.x &&
		st.mapTile.y === tile.y
	) {
		return st.map;
	}
	const r = size >> 1;
	const ox = tile.x - r;
	const oy = tile.y - r;
	const cells = new Uint8Array(size * size);
	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			if (surface || dungeon.isFloor(ox + i, oy + j)) {
				cells[j * size + i] = 1;
			}
		}
	}
	st.mapTile = { x: tile.x, y: tile.y };
	st.map = { origin: { x: ox, y: oy }, size, cells };
	return st.map;
}
