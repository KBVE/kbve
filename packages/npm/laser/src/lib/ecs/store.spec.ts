import { describe, it, expect } from 'vitest';
import { EntityStore, type SpawnData } from './store';

type Ref = { id: number };

const spawnData = (x: number, y: number): SpawnData => ({
	tile: { x, y },
	kind: 1,
	cat: 'npc',
	owner: 0,
	hostile: false,
	hp: 10,
	maxHp: 10,
});

describe('EntityStore spatial index (at)', () => {
	it('finds an entity on its tile and excludes the queried server id', () => {
		const s = new EntityStore<Ref>();
		s.spawn(100, spawnData(4, 7), { id: 100 });

		const hit = s.at(4, 7, -1);
		expect(hit?.serverEid).toBe(100);
		// Excluding the only occupant yields nothing.
		expect(s.at(4, 7, 100)).toBeNull();
		// Empty tile.
		expect(s.at(0, 0, -1)).toBeNull();
	});

	it('returns another occupant when the queried id is excluded', () => {
		const s = new EntityStore<Ref>();
		s.spawn(1, spawnData(2, 2), { id: 1 });
		s.spawn(2, spawnData(2, 2), { id: 2 });
		expect(s.at(2, 2, 1)?.serverEid).toBe(2);
		expect(s.at(2, 2, 2)?.serverEid).toBe(1);
	});

	it('moves an entity between buckets on a tile update', () => {
		const s = new EntityStore<Ref>();
		s.spawn(5, spawnData(1, 1), { id: 5 });
		s.update(5, { tile: { x: 9, y: -3 } });
		expect(s.at(1, 1, -1)).toBeNull();
		expect(s.at(9, -3, -1)?.serverEid).toBe(5);
	});

	it('drops an entity from the index on despawn', () => {
		const s = new EntityStore<Ref>();
		s.spawn(7, spawnData(3, 3), { id: 7 });
		s.despawn(7);
		expect(s.at(3, 3, -1)).toBeNull();
	});

	it('handles negative tile coordinates', () => {
		const s = new EntityStore<Ref>();
		s.spawn(8, spawnData(-12, -34), { id: 8 });
		expect(s.at(-12, -34, -1)?.serverEid).toBe(8);
	});
});
