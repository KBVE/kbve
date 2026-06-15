import { describe, it, expect } from 'vitest';
import {
	createGameWorld,
	spawnNpc,
	spawnNpcFromRef,
	refForEid,
	npcs,
} from './world';
import { Health, Combat, NpcRef, NPC_REF_NONE } from './components';
import { getNpcEntry } from '../data/npcdb';

describe('ecs npcdb-backed spawn', () => {
	it('seeds Health + Combat from npcdb stats and round-trips the ref', () => {
		const world = createGameWorld();
		const eid = spawnNpcFromRef(world, 'archer', 3, 4);
		const stats = getNpcEntry('archer')!.stats!;

		expect(Health.maxHp[eid]).toBe(stats.max_hp);
		expect(Combat.attack[eid]).toBe(stats.attack);
		expect(Combat.defense[eid]).toBe(stats.defense);
		expect(refForEid(eid)).toBe('archer');
	});

	it('falls back to baselines + NPC_REF_NONE without a ref', () => {
		const world = createGameWorld();
		const eid = spawnNpc(world, 0, 0);

		expect(Health.maxHp[eid]).toBe(30);
		expect(Combat.attack[eid]).toBe(1);
		expect(NpcRef.index[eid]).toBe(NPC_REF_NONE);
		expect(refForEid(eid)).toBeUndefined();
	});

	it('seeds the cloud-city npcs from their npcdb entry', () => {
		const world = createGameWorld();
		const eid = spawnNpcFromRef(world, 'barkeep', 1, 1);
		expect(refForEid(eid)).toBe('barkeep');
		expect(Health.maxHp[eid]).toBe(getNpcEntry('barkeep')!.stats!.max_hp);
	});

	it('npcs() query returns spawned npc entities', () => {
		const world = createGameWorld();
		const eid = spawnNpcFromRef(world, 'monk', 2, 2);
		expect([...npcs(world)]).toContain(eid);
	});
});
