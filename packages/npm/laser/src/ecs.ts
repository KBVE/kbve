// Lean ECS subpath: bitecs core + spatial helpers with ZERO Phaser/R3F/Rapier
// dependency, so consumers (and their unit tests in jsdom) don't evaluate the
// heavy rendering modules the main barrel pulls in.

export * from './lib/ecs/bitecs';
export {
	SideMap,
	nearestInRange,
	queryInRange,
	type PositionLike,
} from './lib/ecs/helpers';
