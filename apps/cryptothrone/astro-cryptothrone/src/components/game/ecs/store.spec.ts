import { describe, it, expect } from 'vitest';
import { EntityStore } from './store';

interface Ref {
	tag: string;
}

function store() {
	return new EntityStore<Ref>();
}

const base = {
	tile: { x: 0, y: 0 },
	kind: 1,
	owner: 0xffff,
	hostile: false,
	hp: 10,
	maxHp: 10,
};

describe('EntityStore', () => {
	it('spawns and resolves data by server id', () => {
		const s = store();
		s.spawn(
			42,
			{ ...base, cat: 'npc', tile: { x: 3, y: 5 }, hp: 7, kind: 9 },
			{ tag: 'goblin' },
		);
		expect(s.has(42)).toBe(true);
		expect(s.size()).toBe(1);
		expect(s.tile(42)).toEqual({ x: 3, y: 5 });
		expect(s.hp(42)).toBe(7);
		expect(s.maxHp(42)).toBe(10);
		expect(s.kind(42)).toBe(9);
		expect(s.refs(42)).toEqual({ tag: 'goblin' });
	});

	it('updates tile and health in place', () => {
		const s = store();
		s.spawn(1, { ...base, cat: 'player' }, { tag: 'p' });
		s.update(1, { tile: { x: 8, y: 2 }, hp: 3 });
		expect(s.tile(1)).toEqual({ x: 8, y: 2 });
		expect(s.hp(1)).toBe(3);
		expect(s.maxHp(1)).toBe(10);
	});

	it('despawns and returns refs, dropping the entity', () => {
		const s = store();
		s.spawn(5, { ...base, cat: 'item' }, { tag: 'arrow' });
		const refs = s.despawn(5);
		expect(refs).toEqual({ tag: 'arrow' });
		expect(s.has(5)).toBe(false);
		expect(s.size()).toBe(0);
		expect(s.tile(5)).toBeNull();
	});

	it('finds an entity at a tile, excluding self', () => {
		const s = store();
		s.spawn(
			1,
			{ ...base, cat: 'player', tile: { x: 4, y: 4 } },
			{
				tag: 'me',
			},
		);
		s.spawn(
			2,
			{ ...base, cat: 'npc', tile: { x: 4, y: 4 } },
			{
				tag: 'other',
			},
		);
		expect(s.at(4, 4, 1)?.serverEid).toBe(2);
		expect(s.at(4, 4, 2)?.serverEid).toBe(1);
		expect(s.at(9, 9, 1)).toBeNull();
	});

	it('counts hostiles in range via the Monster query', () => {
		const s = store();
		s.spawn(
			1,
			{ ...base, cat: 'player', tile: { x: 0, y: 0 } },
			{
				tag: 'me',
			},
		);
		s.spawn(
			2,
			{ ...base, cat: 'npc', hostile: true, tile: { x: 2, y: 0 } },
			{ tag: 'goblin' },
		);
		s.spawn(
			3,
			{ ...base, cat: 'npc', hostile: true, tile: { x: 10, y: 0 } },
			{ tag: 'far-goblin' },
		);
		s.spawn(
			4,
			{ ...base, cat: 'npc', hostile: false, tile: { x: 1, y: 0 } },
			{ tag: 'friendly' },
		);
		// radius 3 around (0,0): goblin@2 in, far-goblin@10 out, friendly not Monster
		expect(s.hostilesInRange(0, 0, 3)).toBe(1);
		expect(s.hostilesInRange(0, 0, 12)).toBe(2);
	});

	it('lists server ids by category', () => {
		const s = store();
		s.spawn(1, { ...base, cat: 'player' }, { tag: 'p' });
		s.spawn(2, { ...base, cat: 'npc' }, { tag: 'n' });
		s.spawn(3, { ...base, cat: 'item' }, { tag: 'i' });
		expect(s.serverIdsWith('player')).toContain(1);
		expect(s.serverIdsWith('npc')).toContain(2);
		expect(s.serverIdsWith('item')).toContain(3);
		expect(s.serverIdsWith('player')).not.toContain(2);
	});
});
