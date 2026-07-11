// Lean ECS subpath: bitecs core + spatial helpers with ZERO Phaser/R3F/Rapier
// dependency, so consumers (and their unit tests in jsdom) don't evaluate the
// heavy rendering modules the main barrel pulls in.

export * from './lib/ecs/bitecs';
export {
	SideMap,
	nearestInRange,
	queryInRange,
	packTile,
	type PositionLike,
} from './lib/ecs/helpers';
export * from './lib/ecs/components';
export * from './lib/ecs/stats';
export * from './lib/ecs/props';
export * from './lib/ecs/pool';
export {
	EntityStore,
	Cat,
	type EntityCat,
	type SpawnData,
	type UpdateData,
} from './lib/ecs/store';
