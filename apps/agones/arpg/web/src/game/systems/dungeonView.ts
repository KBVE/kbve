import Phaser from 'phaser';
import { packTile } from '@kbve/laser';
import {
	TILE_W,
	TILE_H,
	DEPTH_TILE,
	DEPTH_ENTITY_BASE,
	GROUND_TEXTURE_KEY,
	GRASS_TEXTURE_KEY,
	GRASS_DETAIL_TEXTURE_KEY,
	GRASS_MACRO_TEXTURE_KEY,
	DUNGEON_RADIUS,
} from '../config';
import { worldToScreen, tileDepth, type TileXY } from '../iso';
import { DungeonField, chunkOf, CHUNK_SIZE, StairKind } from './dungeon';
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
	holeLayer: Phaser.GameObjects.Graphics;
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
		// Black diamonds punched over every non-floor tile, above the ground but
		// below entities — the dungeon's room/corridor shape reads as the holes
		// in the tiled ground.
		holeLayer: scene.add.graphics().setDepth(DEPTH_TILE + 1),
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
export function refreshDungeonView(
	scene: Phaser.Scene,
	view: DungeonView,
	dungeon: DungeonField,
	surface: boolean,
	focus: TileXY,
	force = false,
): void {
	const { cx, cy } = chunkOf(focus.x, focus.y);
	const ckey = packTile(cx, cy);
	if (!force && ckey === view.lastChunkKey) return;
	view.lastChunkKey = ckey;

	const { added, removed } = dungeon.refresh(focus);
	for (const c of added) buildChunkGround(scene, view, surface, c.cx, c.cy);
	for (const c of removed) unloadChunkGround(view, c.cx, c.cy);
	paintHoles(scene, view, dungeon, surface, cx, cy);
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
): void {
	for (const plane of view.chunkGrounds.values()) plane.destroy();
	view.chunkGrounds.clear();
	view.lastChunkKey = -1;
	refreshDungeonView(scene, view, dungeon, surface, focus, true);
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

interface GrassOverlay {
	key: string;
	scale: number;
	rot: number;
	alpha: number;
	blend: Phaser.BlendModes;
}

const GRASS_OVERLAYS: GrassOverlay[] = [
	{
		key: GRASS_DETAIL_TEXTURE_KEY,
		scale: 1.73,
		rot: BASE_ROT + 0.45,
		alpha: 0.5,
		blend: Phaser.BlendModes.MULTIPLY,
	},
	{
		key: GRASS_MACRO_TEXTURE_KEY,
		scale: 4.3,
		rot: BASE_ROT - 0.7,
		alpha: 0.28,
		blend: Phaser.BlendModes.MULTIPLY,
	},
];

/**
 * tilePosition that pins a tile-scaled, rotated TileSprite to world space so its
 * texture neither slides as the camera moves nor seams at chunk borders. It is
 * the inverse of the layer's own rotation (NOT the base 45°), so each overlay can
 * lean at its own angle and still line up across chunks.
 */
function worldAnchor(ux: number, uy: number, rot: number, scale: number) {
	const c = Math.cos(rot);
	const s = Math.sin(rot);
	return { x: (ux * c + uy * s) / scale, y: (-ux * s + uy * c) / scale };
}

function addGrassOverlay(
	scene: Phaser.Scene,
	side: number,
	ux: number,
	uy: number,
	o: GrassOverlay,
): Phaser.GameObjects.TileSprite {
	const t = scene.add.tileSprite(0, 0, side, side, o.key);
	t.setOrigin(0.5, 0.5);
	t.setRotation(o.rot);
	t.setTileScale(o.scale, o.scale);
	const a = worldAnchor(ux, uy, o.rot, o.scale);
	t.tilePositionX = a.x;
	t.tilePositionY = a.y;
	t.setAlpha(o.alpha);
	t.setBlendMode(o.blend);
	return t;
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
	const side = CHUNK_SIZE * TILE_W + TILE_W * 2;
	const sprite = scene.add.tileSprite(
		0,
		0,
		side,
		side,
		surface ? GRASS_TEXTURE_KEY : GROUND_TEXTURE_KEY,
	);
	sprite.setOrigin(0.5, 0.5);
	sprite.setRotation(-Math.PI / 4);

	const midX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
	const midY = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
	const c = worldToScreen(midX, midY);

	// On the grass surface, stack overlay grass layers over the base. Each rides a
	// different tile-scale AND a different texture rotation, so the grass blades
	// lean different ways instead of all pointing the iso diagonal — the field
	// reads as natural ground, not one tiled bitmap. Every layer is world-anchored
	// through its OWN rotation (worldAnchor below), so they stay seamless across
	// chunks despite the varied angles. Dungeon floors keep the single stone tile.
	const layers = [sprite];
	const ux = c.x;
	const uy = c.y / 0.5;
	const baseAnchor = worldAnchor(ux, uy, BASE_ROT, 1);
	sprite.tilePositionX = baseAnchor.x;
	sprite.tilePositionY = baseAnchor.y;
	if (surface) {
		for (const L of GRASS_OVERLAYS) {
			layers.push(addGrassOverlay(scene, side * 1.5, ux, uy, L));
		}
	}

	const plane = scene.add.container(c.x, c.y, layers);
	plane.setScale(1, 0.5);
	plane.setDepth(DEPTH_TILE);
	view.chunkGrounds.set(key, plane);
}

function unloadChunkGround(view: DungeonView, cx: number, cy: number): void {
	const key = packTile(cx, cy);
	view.chunkGrounds.get(key)?.destroy();
	view.chunkGrounds.delete(key);
}

/**
 * Repaint the hole layer: a black iso diamond on every non-floor tile in the
 * live chunk window. Painting holes (sparse walls) rather than floors keeps the
 * tiled ground texture intact underneath the walkable space.
 */
function paintHoles(
	scene: Phaser.Scene,
	view: DungeonView,
	dungeon: DungeonField,
	surface: boolean,
	cx: number,
	cy: number,
): void {
	const g = view.holeLayer;
	g.clear();
	// Surface floors are open grass — no walls to punch holes for.
	if (surface) return;
	g.fillStyle(0x05070d, 1);
	const hw = TILE_W / 2;
	const hh = TILE_H / 2;
	const r = DUNGEON_RADIUS;
	const minX = (cx - r) * CHUNK_SIZE;
	const minY = (cy - r) * CHUNK_SIZE;
	const maxX = (cx + r + 1) * CHUNK_SIZE;
	const maxY = (cy + r + 1) * CHUNK_SIZE;
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
