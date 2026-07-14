import { describe, it, expect } from 'vitest';
import {
	getItemById as getItem,
	getAllItems,
	getStealLootPool,
	pickStealLoot,
} from './items';
import { getAllItems as getCanonical } from './itemdb';
import { getNPCById, getDialogueById } from './npcs';

describe('itemdb adapter', () => {
	const all = getCanonical();

	it('adapts a populated canonical pool', () => {
		expect(all.length).toBeGreaterThan(50);
	});

	it('maps consumable type + aliases health/mana bonuses to hp/mp', () => {
		const shark = all.find((i) => i.id === 'blue-shark');
		expect(shark).toBeDefined();
		expect(shark!.type).toBe('consumable');
		expect(shark!.bonuses.hp).toBe(50);
		expect(shark!.bonuses.mp).toBe(25);
		expect(shark!.actions).toContain('use');
		expect(shark!.rarity).toBe('common');
	});

	it('maps weapon type for an iron sword', () => {
		const sword = all.find((i) => i.id === 'iron-sword');
		expect(sword!.type).toBe('weapon');
		expect(sword!.actions).toContain('equip');
	});

	it('every adapted item has a non-empty img and bounded weight', () => {
		for (const item of all) {
			expect(item.img.length).toBeGreaterThan(0);
			expect(item.weight).toBeGreaterThanOrEqual(0);
			expect(item.durability).toBeGreaterThanOrEqual(0);
		}
	});

	it('rarity is always one of the canonical tiers', () => {
		const tiers = new Set([
			'common',
			'uncommon',
			'rare',
			'epic',
			'legendary',
			'mythic',
		]);
		for (const item of all) {
			expect(tiers.has(item.rarity)).toBe(true);
		}
	});
});

describe('items facade', () => {
	it('exposes the canonical pool plus the local health-potion fallback', () => {
		const items = getAllItems();
		expect(items.find((i) => i.id === 'health-potion')).toBeDefined();
		expect(items.length).toBeGreaterThanOrEqual(getCanonical().length);
	});

	it('getItemById resolves known ids and returns undefined otherwise', () => {
		expect(getItem('health-potion')?.name).toBe('Health Potion');
		expect(getItem('iron-sword')).toBeDefined();
		expect(getItem('___nope___')).toBeUndefined();
	});
});

describe('steal loot', () => {
	it('pool excludes quest items and is non-empty', () => {
		const pool = getStealLootPool();
		expect(pool.length).toBeGreaterThan(0);
		expect(pool.every((i) => i.type !== 'quest')).toBe(true);
		expect(
			pool.every((i) => i.rarity === 'common' || i.rarity === 'uncommon'),
		).toBe(true);
	});

	it('pickStealLoot returns a real registry item across the roll range', () => {
		for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
			const loot = pickStealLoot(roll);
			expect(loot).toBeDefined();
			expect(getItem(loot!.id)).toBeDefined();
		}
	});
});

describe('npc + dialogue data', () => {
	it('getNPCById resolves known npcs and misses gracefully', () => {
		expect(getNPCById('npc_barkeep')?.name).toBe('Evee The BarKeep');
		expect(getNPCById('npc_monk')).toBeDefined();
		expect(getNPCById('npc_ghost')).toBeUndefined();
	});

	it('getDialogueById resolves dialogue trees and misses gracefully', () => {
		const greeting = getDialogueById('dlg_barkeep_greeting');
		expect(greeting?.title).toBe('Greeting');
		expect(Array.isArray(greeting?.options)).toBe(true);
		expect(getDialogueById('dlg_unknown')).toBeUndefined();
	});

	it('dialogue option targets resolve to real nodes', () => {
		const greeting = getDialogueById('dlg_barkeep_greeting')!;
		for (const opt of greeting.options ?? []) {
			expect(getDialogueById(opt.nextDialogueId)).toBeDefined();
		}
	});
});
