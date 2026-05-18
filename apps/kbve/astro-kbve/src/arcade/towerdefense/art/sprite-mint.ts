import Phaser from 'phaser';
import {
	ARMOURY_CATALOG,
	BATTERY_CATALOG,
	GENERATOR_CATALOG,
	REPAIR_CATALOG,
	TOWER_CATALOG,
	type BuildId,
} from '../config';
import { derivePalette, type BuildingPalette } from './palette';
import { BUILDING_GRIDS, GRID_PIXEL_SIZE } from './grids';

const TEXTURE_PREFIX = 'td_building_';

export function buildingTextureKey(id: BuildId): string {
	return `${TEXTURE_PREFIX}${id}`;
}

function paletteFor(ch: string, p: BuildingPalette): string | null {
	switch (ch) {
		case '0':
			return p.outline;
		case '1':
			return p.shadow;
		case '2':
			return p.mid;
		case '3':
			return p.base;
		case '4':
			return p.highlight;
		default:
			return null;
	}
}

function mintTexture(
	scene: Phaser.Scene,
	key: string,
	grid: string[],
	palette: BuildingPalette,
	pixelSize: number,
): void {
	if (scene.textures.exists(key)) return;
	const rows = grid.length;
	const cols = grid[0].length;
	const w = cols * pixelSize;
	const h = rows * pixelSize;
	const tex = scene.textures.createCanvas(key, w, h);
	if (!tex) return;
	const ctx = tex.getContext();
	for (let y = 0; y < rows; y++) {
		const row = grid[y];
		for (let x = 0; x < cols; x++) {
			const color = paletteFor(row[x], palette);
			if (!color) continue;
			ctx.fillStyle = color;
			ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
		}
	}
	tex.refresh();
	tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

const BUILD_CATALOG_COLORS: Record<BuildId, number> = (() => {
	const out: Record<string, number> = {};
	for (const id in TOWER_CATALOG)
		out[id] = TOWER_CATALOG[id as keyof typeof TOWER_CATALOG].color;
	for (const id in GENERATOR_CATALOG)
		out[id] = GENERATOR_CATALOG[id as keyof typeof GENERATOR_CATALOG].color;
	for (const id in BATTERY_CATALOG)
		out[id] = BATTERY_CATALOG[id as keyof typeof BATTERY_CATALOG].color;
	for (const id in REPAIR_CATALOG)
		out[id] = REPAIR_CATALOG[id as keyof typeof REPAIR_CATALOG].color;
	for (const id in ARMOURY_CATALOG)
		out[id] = ARMOURY_CATALOG[id as keyof typeof ARMOURY_CATALOG].color;
	return out as Record<BuildId, number>;
})();

export function ensureBuildingTextures(scene: Phaser.Scene): void {
	for (const idRaw in BUILDING_GRIDS) {
		const id = idRaw as BuildId;
		const palette = derivePalette(BUILD_CATALOG_COLORS[id]);
		mintTexture(
			scene,
			buildingTextureKey(id),
			BUILDING_GRIDS[id],
			palette,
			GRID_PIXEL_SIZE,
		);
	}
}
