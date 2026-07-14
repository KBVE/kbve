import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITY_PALETTE, DUNGEON_PALETTE, Role } from './dungeon';

// nx runs vitest with cwd at the project dir, not the workspace root, so anchor
// on this file and walk up to the repo that holds the generated catalog.
function resolveFromWorkspace(rel: string): string {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 12; i++) {
		const candidate = resolve(dir, rel);
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(`could not locate ${rel} from ${import.meta.url}`);
}

const ROLE_NAMES = new Set([
	'unspecified',
	'ground',
	'plaza',
	'road',
	'grass',
	'wall',
	'roof',
	'door',
	'water',
	'prop',
	'prop_solid',
	'void',
]);

const catalog: Array<Record<string, unknown>> = JSON.parse(
	readFileSync(
		resolveFromWorkspace(
			'packages/data/codegen/generated/tiledb-data.json',
		),
		'utf8',
	),
);

describe('tiledb catalog (MDX -> json)', () => {
	it('every tile has the required catalog fields', () => {
		expect(catalog.length).toBeGreaterThan(0);
		for (const t of catalog) {
			expect(typeof t.ref).toBe('string');
			expect(typeof t.image).toBe('string');
			expect(ROLE_NAMES.has(t.role as string)).toBe(true);
			expect((t.frameCount as number) >= 1).toBe(true);
			expect(Array.isArray(t.biomes)).toBe(true);
		}
	});

	it('water is an animated 2-frame tile', () => {
		const water = catalog.find((t) => t.ref === 'water')!;
		expect(water.frameCount).toBe(2);
		expect(
			(water.animation as { hasAnimation: boolean }).hasAnimation,
		).toBe(true);
	});
});

describe('packed palette carries catalog animation + collision', () => {
	it('city palette exposes the animated water tile', () => {
		const waterGid = CITY_PALETTE.entries[Role.WATER][0];
		const anim = CITY_PALETTE.animations?.[waterGid];
		expect(anim, 'water gid should be animated').toBeDefined();
		expect(anim!.frames.length).toBeGreaterThanOrEqual(2);
		for (const f of anim!.frames)
			expect(f).toBeLessThanOrEqual(CITY_PALETTE.tileCount);
	});

	it('collision map covers every gid the palette can place', () => {
		for (const palette of [CITY_PALETTE, DUNGEON_PALETTE]) {
			const placed = new Set(Object.values(palette.entries).flat());
			for (const g of placed)
				expect(
					palette.collision?.[g],
					`gid ${g} has no collision flag`,
				).toBeDefined();
		}
	});

	it('ground is walkable, wall blocks, in the collision map', () => {
		expect(
			CITY_PALETTE.collision![CITY_PALETTE.entries[Role.GROUND][0]],
		).toBe(false);
		expect(
			CITY_PALETTE.collision![CITY_PALETTE.entries[Role.WALL][0]],
		).toBe(true);
	});
});
