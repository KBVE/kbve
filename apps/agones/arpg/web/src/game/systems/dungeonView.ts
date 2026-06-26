import Phaser from 'phaser';
import { packTile } from '@kbve/laser';
import {
	TILE_W,
	TILE_H,
	DEPTH_TILE,
	DEPTH_ENTITY_BASE,
	GROUND_TEXTURE_KEY,
	DUNGEON_RADIUS,
	USE_GROUND_SHADER,
} from '../config';
import { worldToScreen, tileDepth, type TileXY } from '../iso';
import { DungeonField, chunkOf, CHUNK_SIZE, StairKind } from './dungeon';
import { biomeKeyAt } from './biome';
import {
	makeStairSprite,
	type StairId,
	type StairMaterial,
} from '../entities/stairs';

/**
 * Render state for the streamed dungeon: the world-anchored ground tiles, the
 * hole-diamond overlay, and the two stair props. The DungeonField (walkability,
 * floor/seed) lives on the scene since collision + movement + minimap share it;
 * this view owns only the Phaser display objects derived from it.
 */
export interface DungeonView {
	// Packed chunk key (packTile(cx, cy)) -> world-anchored ground container.
	chunkGrounds: Map<number, Phaser.GameObjects.Container>;
	// Pooled hole Graphics per chunk (reused across floor changes).
	chunkHoles: Map<number, Phaser.GameObjects.Graphics>;
	stairSprites: Phaser.GameObjects.Image[];
	// Packed key of the chunk last streamed around; -1 = none yet (packed keys
	// are always >= 0, so the sentinel never collides).
	lastChunkKey: number;
	// Material set + which sprite (1-12) renders for the up (ascend) and down
	// (descend) stair. 1-8 are raised steps, 9-12 inverted pits; swap freely.
	stairMaterial: StairMaterial;
	stairUpId: StairId;
	stairDownId: StairId;
}

export function makeDungeonView(scene: Phaser.Scene): DungeonView {
	return {
		chunkGrounds: new Map(),
		chunkHoles: new Map(),
		stairSprites: [],
		lastChunkKey: -1,
		stairMaterial: 'grey_stone',
		stairUpId: 1,
		stairDownId: 9,
	};
}

/**
 * Stream the dungeon window to `focus` on a chunk change: regenerate the field,
 * build a WORLD-anchored ground tile for each newly-entered chunk, unload the
 * ones left behind, and repaint the hole diamonds. Each chunk's ground is fixed
 * at its own world origin, so nothing slides as the player walks — areas simply
 * load ahead and unload behind. `force` runs on build.
 */
export interface ChunkCoord {
	cx: number;
	cy: number;
}

export function refreshDungeonView(
	scene: Phaser.Scene,
	view: DungeonView,
	dungeon: DungeonField,
	surface: boolean,
	focus: TileXY,
	force = false,
	onChunks?: (added: ChunkCoord[], removed: ChunkCoord[]) => void,
): void {
	const { cx, cy } = chunkOf(focus.x, focus.y);
	const ckey = packTile(cx, cy);
	if (!force && ckey === view.lastChunkKey) return;
	view.lastChunkKey = ckey;

	const { added, removed } = dungeon.refresh(focus);
	for (const c of added) {
		buildChunkGround(scene, view, surface, c.cx, c.cy);
		buildChunkHoles(scene, view, dungeon, surface, c.cx, c.cy);
	}
	for (const c of removed) {
		unloadChunkGround(view, c.cx, c.cy);
		hideChunkHoles(view, c.cx, c.cy);
	}
	if (onChunks && (added.length || removed.length)) onChunks(added, removed);
}

/**
 * Build or reuse a Graphics object for this chunk's holes (one Graphics per
 * chunk = 576 tiles). Draw once, show/hide on stream. Reused across floors.
 */
function buildChunkHoles(
	scene: Phaser.Scene,
	view: DungeonView,
	dungeon: DungeonField,
	surface: boolean,
	cx: number,
	cy: number,
): void {
	const key = packTile(cx, cy);
	let g = view.chunkHoles.get(key);
	if (!g) {
		g = scene.add.graphics().setDepth(DEPTH_TILE + 1);
		view.chunkHoles.set(key, g);
	}
	g.clear();
	g.setVisible(!surface);
	if (surface) return;

	g.fillStyle(0x05070d, 1);
	const hw = TILE_W / 2;
	const hh = TILE_H / 2;
	const minX = cx * CHUNK_SIZE;
	const minY = cy * CHUNK_SIZE;
	const maxX = minX + CHUNK_SIZE;
	const maxY = minY + CHUNK_SIZE;
	for (let y = minY; y < maxY; y++) {
		for (let x = minX; x < maxX; x++) {
			if (dungeon.isFloor(x, y)) continue;
			const p = worldToScreen(x, y);
			g.beginPath();
			g.moveTo(p.x, p.y - hh);
			g.lineTo(p.x + hw, p.y);
			g.lineTo(p.x, p.y + hh);
			g.lineTo(p.x - hw, p.y);
			g.closePath();
			g.fillPath();
		}
	}
}

function hideChunkHoles(view: DungeonView, cx: number, cy: number): void {
	const key = packTile(cx, cy);
	view.chunkHoles.get(key)?.setVisible(false);
}

/**
 * Hard reset of the rendered dungeon — used on a floor change, where the whole
 * layout is replaced (a fresh DungeonField was assigned). Tear down every chunk
 * ground, clear holes, and force a re-stream around the new position.
 */
export function rebuildDungeonView(
	scene: Phaser.Scene,
	view: DungeonView,
	dungeon: DungeonField,
	surface: boolean,
	focus: TileXY,
	onChunks?: (added: ChunkCoord[], removed: ChunkCoord[]) => void,
): void {
	for (const plane of view.chunkGrounds.values()) plane.destroy();
	view.chunkGrounds.clear();
	// Hide all hole Graphics (reused across floors).
	for (const g of view.chunkHoles.values()) g.setVisible(false);
	view.lastChunkKey = -1;
	refreshDungeonView(scene, view, dungeon, surface, focus, true, onChunks);
}

/**
 * Drop and re-place the two stair props for the active floor. Tiles come from
 * the field's parity-shared `stairTile`, so each prop sits exactly on the tile
 * the server's `Stairs::at` triggers a floor change — stepping on the raised
 * steps ascends (z-1), on the inverted pit descends (z+1). Depth sits just under
 * entities so the player renders climbing onto it.
 */
export function placeStairs(
	scene: Phaser.Scene,
	view: DungeonView,
	dungeon: DungeonField,
): void {
	for (const s of view.stairSprites) s.destroy();
	view.stairSprites = [];
	const place = (kind: StairKind, id: StairId) => {
		const tile = dungeon.stairTile(kind);
		const sprite = makeStairSprite(scene, view.stairMaterial, id);
		const p = worldToScreen(tile.x, tile.y);
		sprite.setPosition(p.x, p.y + 8);
		sprite.setDepth(DEPTH_ENTITY_BASE + tileDepth(tile.x, tile.y) - 1);
		view.stairSprites.push(sprite);
	};
	place(StairKind.Up, view.stairUpId);
	place(StairKind.Down, view.stairDownId);
}

const BASE_ROT = -Math.PI / 4;

/**
 * tilePosition that pins the ground TileSprite to world space so its texture
 * neither slides as the camera moves nor seams at chunk borders. The chunk
 * container squashes Y by 0.5 and the inverse un-squash baked into the caller's
 * uy is only valid at the base iso rotation, so the ground rides BASE_ROT.
 */
function worldAnchor(ux: number, uy: number, rot: number, scale: number) {
	const c = Math.cos(rot);
	const s = Math.sin(rot);
	return { x: (ux * c + uy * s) / scale, y: (-ux * s + uy * c) / scale };
}

/**
 * One world-anchored ground tile for a chunk: a TileSprite covering the chunk's
 * tile square, projected onto the iso plane (inner sprite rotated 45°, parent
 * Container squashed 2:1 — Phaser scales before it rotates, so a lone sprite
 * can't be projected directly) and pinned at the chunk's world centre. Fixed in
 * world space → the texture never slides.
 */
function buildChunkGround(
	scene: Phaser.Scene,
	view: DungeonView,
	surface: boolean,
	cx: number,
	cy: number,
): void {
	const key = packTile(cx, cy);
	if (view.chunkGrounds.has(key)) return;
	if (surface && USE_GROUND_SHADER) return;
	const side = CHUNK_SIZE * TILE_W + TILE_W * 2;
	const sprite = scene.add.tileSprite(
		0,
		0,
		side,
		side,
		surface ? biomeKeyAt(cx, cy) : GROUND_TEXTURE_KEY,
	);
	sprite.setOrigin(0.5, 0.5);
	sprite.setRotation(-Math.PI / 4);

	const midX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
	const midY = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
	const c = worldToScreen(midX, midY);

	const ux = c.x;
	const uy = c.y / 0.5;
	const baseAnchor = worldAnchor(ux, uy, BASE_ROT, 1);
	sprite.tilePositionX = baseAnchor.x;
	sprite.tilePositionY = baseAnchor.y;

	const plane = scene.add.container(c.x, c.y, [sprite]);
	plane.setScale(1, 0.5);
	plane.setDepth(DEPTH_TILE);
	view.chunkGrounds.set(key, plane);
}

function unloadChunkGround(view: DungeonView, cx: number, cy: number): void {
	const key = packTile(cx, cy);
	view.chunkGrounds.get(key)?.destroy();
	view.chunkGrounds.delete(key);
}
