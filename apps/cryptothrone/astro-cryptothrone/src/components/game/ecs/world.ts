import { createWorld, addEntity, addComponent, query } from '@kbve/laser';
import type { World } from '@kbve/laser';
import { Position, Health, PlayerTag, NpcTag, MonsterTag } from './components';

export type GameWorld = World;

export function createGameWorld(): GameWorld {
	return createWorld();
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
	addComponent(world, eid, tag);
	Position.x[eid] = x;
	Position.y[eid] = y;
	Health.hp[eid] = hp;
	Health.maxHp[eid] = hp;
	return eid;
}

export function spawnPlayer(world: GameWorld, x: number, y: number): number {
	return spawn(world, PlayerTag, x, y, 100);
}

export function spawnNpc(world: GameWorld, x: number, y: number): number {
	return spawn(world, NpcTag, x, y, 30);
}

export function spawnMonster(world: GameWorld, x: number, y: number): number {
	return spawn(world, MonsterTag, x, y, 10);
}

export function players(world: GameWorld): Iterable<number> {
	return query(world, [Position, PlayerTag]);
}

export function monsters(world: GameWorld): Iterable<number> {
	return query(world, [Position, MonsterTag]);
}
