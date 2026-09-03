import { describe, it, expect } from 'vitest';
import { NpcRegistrySchema } from '@kbve/npcdb-schema';
import { loadNpcRegistry } from '@kbve/npcdb';
import {
	getAllNpcEntries,
	getNpcEntry,
	getNpcStats,
	isHostileRef,
} from './npcdb';

describe('npcdb barrel (unified type)', () => {
	it('loader output validates against the proto NpcRegistrySchema', () => {
		// Proves the camelCase+prefixed JSON was reversed back into the exact
		// authoring shape the single unified `Npc` type describes.
		const result = NpcRegistrySchema.safeParse(loadNpcRegistry());
		if (!result.success) {
			throw new Error(
				'npcdb loader output failed schema validation: ' +
					JSON.stringify(result.error.issues.slice(0, 4), null, 2),
			);
		}
		expect(result.success).toBe(true);
	});

	it('exposes a non-empty, ref-unique pool', () => {
		const all = getAllNpcEntries();
		expect(all.length).toBeGreaterThan(0);
		const refs = all.map((n) => n.ref);
		expect(new Set(refs).size).toBe(refs.length);
	});

	it('reverses the proto-canonical archer fixture to authoring shape', () => {
		const archer = getNpcEntry('archer');
		expect(archer).toBeDefined();
		expect(archer!.name).toBe('Archer');
		// Enum prefixes stripped, snake_case keys.
		expect(archer!.rarity).toBe('common');
		expect(archer!.behavior?.movement_type).toBe('patrol');
		expect(archer!.family).toBe('humanoid');
		expect(archer!.stats?.max_hp).toBe(50);
	});

	it('includes the cryptothrone NPCs now sourced from npcdb', () => {
		const barkeep = getNpcEntry('barkeep');
		expect(barkeep).toBeDefined();
		expect(barkeep!.name).toBe('Evee The BarKeep');
		expect(barkeep!.tags).toContain('merchant');
		expect(barkeep!.faction?.faction_id).toBe('player');

		const monk = getNpcEntry('monk');
		expect(monk).toBeDefined();
		expect(monk!.name).toBe('Elder Monk');
	});

	it('serves canonical stats by ref', () => {
		const stats = getNpcStats('archer');
		expect(stats).toMatchObject({
			hp: 50,
			max_hp: 50,
			attack: 6,
			defense: 1,
			speed: 4,
			armor: 1,
		});
	});

	it('returns undefined / false for unknown refs', () => {
		expect(getNpcEntry('does-not-exist')).toBeUndefined();
		expect(getNpcStats('does-not-exist')).toBeUndefined();
		expect(isHostileRef('does-not-exist')).toBe(false);
	});

	it('every enum leaf is fully de-prefixed across the pool', () => {
		for (const n of getAllNpcEntries()) {
			expect(n.rarity).not.toMatch(/NPC_RARITY_/);
			expect(n.rank).not.toMatch(/NPC_RANK_/);
			expect(n.personality).not.toMatch(/PERSONALITY_/);
			if (n.behavior?.movement_type) {
				expect(n.behavior.movement_type).not.toMatch(/MOVEMENT_TYPE_/);
			}
		}
	});
});
