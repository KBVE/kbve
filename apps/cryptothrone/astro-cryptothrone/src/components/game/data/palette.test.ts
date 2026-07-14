import { describe, it, expect } from 'vitest';
import {
	CITY_PALETTE,
	DUNGEON_PALETTE,
	townTilemap,
	dungeonTilemap,
	generateTown,
	generateDungeon,
	Role,
	type TilePalette,
} from './dungeon';

function assertValid(p: TilePalette) {
	expect(p.tilesetImage).toMatch(/\.atlas\.png$/);
	expect(p.tilesetColumns).toBeGreaterThan(0);
	// every dense gid sits inside the packed atlas
	for (const gids of Object.values(p.entries))
		for (const g of gids) {
			expect(g).toBeGreaterThanOrEqual(1);
			expect(g).toBeLessThanOrEqual(p.tileCount);
		}
}

describe('generated tile palettes', () => {
	it('city + dungeon palettes load with valid packed gids', () => {
		assertValid(CITY_PALETTE);
		assertValid(DUNGEON_PALETTE);
	});

	it('covers every role the town generator emits', () => {
		const roles = new Set(generateTown(2024).roles);
		for (const r of roles) {
			expect(CITY_PALETTE.entries[r], `role ${r} unmapped`).toBeDefined();
			expect(CITY_PALETTE.entries[r].length).toBeGreaterThan(0);
		}
	});

	it('covers every role the dungeon generator emits', () => {
		const roles = new Set(generateDungeon(1337).roles);
		for (const r of roles) {
			expect(
				DUNGEON_PALETTE.entries[r],
				`role ${r} unmapped`,
			).toBeDefined();
		}
	});

	it('town tilemap renders through the packed atlas, collision intact', () => {
		const tm = townTilemap(2024);
		const t = generateTown(2024);
		expect(tm.tilesetImage).toBe(CITY_PALETTE.tilesetImage);
		expect(tm.tilesetColumns).toBe(CITY_PALETTE.tilesetColumns);
		expect(tm.blocked).toEqual(t.blocked);
		// every emitted tile resolves to a real (non-zero) packed gid
		expect(tm.layers[0].data.every((g) => g >= 1)).toBe(true);
		// plaza spawn renders the ground tile
		const si = tm.spawn.y * tm.width + tm.spawn.x;
		expect(tm.layers[0].data[si]).toBe(
			CITY_PALETTE.entries[Role.GROUND][0],
		);
	});

	it('dungeon tilemap uses the dungeon atlas', () => {
		const tm = dungeonTilemap(1337);
		expect(tm.tilesetImage).toBe(DUNGEON_PALETTE.tilesetImage);
	});
});
