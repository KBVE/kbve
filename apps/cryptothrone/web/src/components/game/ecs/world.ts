import {
	createWorld,
	addEntity,
	addComponent,
	query,
	type World,
} from '@kbve/laser/ecs';
import {
	Position,
	Health,
	Active,
	Combat,
	NpcRef,
	NPC_REF_NONE,
	PlayerTag,
	NpcTag,
	MonsterTag,
} from './components';
import { getNpcEntry, getAllNpcEntries } from '../data/npcdb';

export type GameWorld = World;

export function createGameWorld(): GameWorld {
	return createWorld();
}

// Stable ref ↔ index table so the numeric ECS `NpcRef` component can round-trip
// back to its npcdb entry. Order follows the npcdb pool.
const npcRefTable: string[] = getAllNpcEntries().map((n) => n.ref);
const npcRefIndex = new Map<string, number>(
	npcRefTable.map((ref, i) => [ref, i]),
);

/** The npcdb ref backing an entity, or undefined when it is not npcdb-backed. */
export function refForEid(eid: number): string | undefined {
	const i = NpcRef.index[eid];
	return i >= 0 ? npcRefTable[i] : undefined;
}

function spawn(
	world: GameWorld,
	tag: Record<string, never>,
	x: number,
	y: number,
	hp: number,
): number {
	const eid = addEntity(world);
	addComponent(world, eid, Position);
	addComponent(world, eid, Health);
	addComponent(world, eid, Active);
	addComponent(world, eid, tag);
	Position.x[eid] = x;
	Position.y[eid] = y;
	Health.hp[eid] = hp;
	Health.maxHp[eid] = hp;
	Active.value[eid] = 1;
	return eid;
}

export function spawnPlayer(world: GameWorld, x: number, y: number): number {
	return spawn(world, PlayerTag, x, y, 100);
}

/**
 * Spawn an NPC entity. With an npcdb `ref` the entity's Health + Combat are
 * seeded from the canonical npcdb stats and a `NpcRef` back-reference is stored
 * so systems can resolve the full entry; without one it uses generic baselines.
 */
export function spawnNpc(
	world: GameWorld,
	x: number,
	y: number,
	ref?: string,
): number {
	const stats = ref ? getNpcEntry(ref)?.stats : undefined;
	const hp = stats?.max_hp || 30;
	const eid = spawn(world, NpcTag, x, y, hp);
	addComponent(world, eid, Combat);
	addComponent(world, eid, NpcRef);
	Combat.attack[eid] = stats?.attack ?? 1;
	Combat.defense[eid] = stats?.defense ?? 0;
	NpcRef.index[eid] = ref
		? (npcRefIndex.get(ref) ?? NPC_REF_NONE)
		: NPC_REF_NONE;
	return eid;
}

/** Convenience spawn keyed directly by an npcdb ref. */
export function spawnNpcFromRef(
	world: GameWorld,
	ref: string,
	x: number,
	y: number,
): number {
	return spawnNpc(world, x, y, ref);
}

export function spawnMonster(world: GameWorld, x: number, y: number): number {
	return spawn(world, MonsterTag, x, y, 10);
}

export function players(world: GameWorld): Iterable<number> {
	return query(world, [Position, PlayerTag]);
}

export function npcs(world: GameWorld): Iterable<number> {
	return query(world, [Position, NpcTag]);
}

export function monsters(world: GameWorld): Iterable<number> {
	return query(world, [Position, MonsterTag]);
}
