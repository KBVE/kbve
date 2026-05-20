import Phaser from 'phaser';
import {
	ARMOURY_CATALOG,
	BATTERY_CATALOG,
	ENEMY_CATALOG,
	GENERATOR_CATALOG,
	REPAIR_CATALOG,
	TOWER_CATALOG,
	type BuildId,
	type EnemyTypeId,
	type TowerId,
} from '../config';
import { derivePalette, type BuildingPalette } from './palette';
import { BUILDING_GRIDS, GRID_PIXEL_SIZE } from './grids';
import { ENEMY_GRIDS, ENEMY_PIXEL_SIZE } from './enemy-grids';
import { UNIT_GRIDS, UNIT_PIXEL_SIZE, type UnitKindId } from './unit-grids';

const BUILDING_PREFIX = 'td_building_';
const ENEMY_PREFIX = 'td_enemy_';
const UNIT_PREFIX = 'td_unit_';

export type UnitVariantId =
	| 'soldier_melee'
	| 'soldier_archer'
	| 'ally_melee'
	| 'ally_archer'
	| 'castle_melee';

interface UnitVariantDef {
	kind: UnitKindId;
	color: number;
}

const UNIT_VARIANTS: Record<UnitVariantId, UnitVariantDef> = {
	soldier_melee: { kind: 'melee', color: 0xd6bcfa },
	soldier_archer: { kind: 'archer', color: 0x63b3ed },
	ally_melee: { kind: 'melee', color: 0xfbd38d },
	ally_archer: { kind: 'archer', color: 0x90cdf4 },
	castle_melee: { kind: 'melee', color: 0xf6e05e },
};

export type BuildingVariant = 'idle' | 'fire';

export function buildingTextureKey(
	id: BuildId,
	variant: BuildingVariant = 'idle',
): string {
	return `${BUILDING_PREFIX}${id}_${variant}`;
}

export function enemyTextureKey(id: EnemyTypeId): string {
	return `${ENEMY_PREFIX}${id}`;
}

export function unitTextureKey(id: UnitVariantId): string {
	return `${UNIT_PREFIX}${id}`;
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

function recoilGrid(idle: string[]): string[] {
	const blank = '.'.repeat(idle[0].length);
	const out: string[] = [blank];
	for (let i = 0; i < 6; i++) out.push(idle[i]);
	for (let i = 7; i < idle.length; i++) out.push(idle[i]);
	return out;
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

const TOWER_IDS: TowerId[] = [
	'basic',
	'wall',
	'bomb',
	'ice',
	'fire',
	'artillery',
];

export function ensureBuildingTextures(scene: Phaser.Scene): void {
	for (const idRaw in BUILDING_GRIDS) {
		const id = idRaw as BuildId;
		const palette = derivePalette(BUILD_CATALOG_COLORS[id]);
		mintTexture(
			scene,
			buildingTextureKey(id, 'idle'),
			BUILDING_GRIDS[id],
			palette,
			GRID_PIXEL_SIZE,
		);
	}
	for (let i = 0; i < TOWER_IDS.length; i++) {
		const id = TOWER_IDS[i];
		const palette = derivePalette(BUILD_CATALOG_COLORS[id]);
		mintTexture(
			scene,
			buildingTextureKey(id, 'fire'),
			recoilGrid(BUILDING_GRIDS[id]),
			palette,
			GRID_PIXEL_SIZE,
		);
	}
}

export function ensureUnitTextures(scene: Phaser.Scene): void {
	for (const idRaw in UNIT_VARIANTS) {
		const id = idRaw as UnitVariantId;
		const def = UNIT_VARIANTS[id];
		const palette = derivePalette(def.color);
		mintTexture(
			scene,
			unitTextureKey(id),
			UNIT_GRIDS[def.kind],
			palette,
			UNIT_PIXEL_SIZE,
		);
	}
}

export function ensureEnemyTextures(scene: Phaser.Scene): void {
	for (const idRaw in ENEMY_GRIDS) {
		const id = idRaw as EnemyTypeId;
		const baseColor = ENEMY_CATALOG[id].color;
		const palette = derivePalette(baseColor);
		mintTexture(
			scene,
			enemyTextureKey(id),
			ENEMY_GRIDS[id],
			palette,
			ENEMY_PIXEL_SIZE,
		);
	}
}
