import { describe, it, expect } from 'vitest';
import {
	getAllNpcEntries,
	getNpcEntry,
	getNpcStats,
	isHostileRef,
} from './npcdb';

describe('npcdb adapter', () => {
	it('loads a non-empty, deduped registry of valid entries', () => {
		const all = getAllNpcEntries();
		expect(all.length).toBeGreaterThan(0);
		// Every entry is well-formed.
		for (const n of all) {
			expect(n.ref).toBeTruthy();
			expect(n.name).toBeTruthy();
			expect(n.id).toBeTruthy();
		}
		// refs are unique.
		const refs = all.map((n) => n.ref);
		expect(new Set(refs).size).toBe(refs.length);
	});

	it('normalizes the archer fixture from the prefixed enums', () => {
		const archer = getNpcEntry('archer');
		expect(archer).toBeDefined();
		expect(archer!.name).toBe('Archer');
		// NPC_RARITY_COMMON -> common, MOVEMENT_TYPE_PATROL -> patrol.
		expect(archer!.rarity).toBe('common');
		expect(archer!.movement).toBe('patrol');
		expect(archer!.family).toBe('humanoid');
		expect(archer!.firstStrike).toBe(true);
		expect(archer!.stats.maxHp).toBe(50);
		expect(archer!.abilities[0]).toMatchObject({ id: 'attack', damage: 6 });
	});

	it('exposes canonical stats by ref', () => {
		const stats = getNpcStats('archer');
		expect(stats).toEqual({
			hp: 50,
			maxHp: 50,
			attack: 6,
			defense: 1,
			speed: 4,
			armor: 1,
		});
	});

	it('every normalized enum resolves to a known union member', () => {
		const families = new Set([
			'humanoid',
			'undead',
			'beast',
			'construct',
			'elemental',
			'demon',
			'plant',
			'aberration',
			'spirit',
			'unknown',
		]);
		const movements = new Set([
			'stationary',
			'random_wander',
			'patrol',
			'scripted',
			'aggressive',
		]);
		const rarities = new Set([
			'common',
			'uncommon',
			'rare',
			'epic',
			'legendary',
			'mythic',
		]);
		for (const n of getAllNpcEntries()) {
			expect(families.has(n.family)).toBe(true);
			expect(movements.has(n.movement)).toBe(true);
			expect(rarities.has(n.rarity)).toBe(true);
			// Prefixes are fully stripped.
			expect(n.rarity).not.toMatch(/NPC_RARITY_/);
			expect(n.movement).not.toMatch(/MOVEMENT_TYPE_/);
		}
	});

	it('returns undefined for unknown refs and false for hostility', () => {
		expect(getNpcEntry('does-not-exist')).toBeUndefined();
		expect(getNpcStats('does-not-exist')).toBeUndefined();
		expect(isHostileRef('does-not-exist')).toBe(false);
	});

	it('marks hostile faction entries as hostile', () => {
		const hostiles = getAllNpcEntries().filter((n) => n.hostile);
		for (const h of hostiles) {
			expect(h.factionId).toBe('hostile');
			expect(isHostileRef(h.ref)).toBe(true);
		}
	});
});
