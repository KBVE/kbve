import {
	createWorld,
	addEntity,
	removeEntity,
	addComponent,
	hasComponent,
	query,
} from 'bitecs';

// ============================================================================
// Components (bitecs 0.4+ - plain arrays/objects stored in world)
// ============================================================================

// SoA (Structure of Arrays) component definitions
const Position = { x: [] as number[], y: [] as number[] };
const Velocity = { x: [] as number[], y: [] as number[] };
const Player = { isGrounded: [] as number[], jumpForce: [] as number[] };
const Platform = {
	width: [] as number[],
	height: [] as number[],
	isGround: [] as number[],
};
const Enemy = { type: [] as number[], speed: [] as number[] };

// ============================================================================
// World Factory
// ============================================================================

export function createGameWorld() {
	return createWorld({
		components: {
			Position,
			Velocity,
			Player,
			Platform,
			Enemy,
		},
	});
}

export type GameWorld = ReturnType<typeof createGameWorld>;

// ============================================================================
// Component Accessors (get typed access from world)
// ============================================================================

export function getComponents(world: GameWorld) {
	return world.components;
}

// ============================================================================
// Entity Factories
// ============================================================================

export function createPlayerEntity(
	world: GameWorld,
	x: number,
	y: number,
	jumpForce: number,
) {
	const { Position, Velocity, Player } = world.components;
	const eid = addEntity(world);

	addComponent(world, eid, Position);
	addComponent(world, eid, Velocity);
	addComponent(world, eid, Player);

	Position.x[eid] = x;
	Position.y[eid] = y;
	Velocity.x[eid] = 0;
	Velocity.y[eid] = 0;
	Player.isGrounded[eid] = 1;
	Player.jumpForce[eid] = jumpForce;

	return eid;
}

export function createPlatformEntity(
	world: GameWorld,
	x: number,
	y: number,
	width: number,
	height: number,
	isGround: boolean = false,
) {
	const { Position, Platform } = world.components;
	const eid = addEntity(world);

	addComponent(world, eid, Position);
	addComponent(world, eid, Platform);

	Position.x[eid] = x;
	Position.y[eid] = y;
	Platform.width[eid] = width;
	Platform.height[eid] = height;
	Platform.isGround[eid] = isGround ? 1 : 0;

	return eid;
}

export const EnemyType = {
	WALKER: 0,
	FLYER: 1,
	SPIKER: 2,
} as const;

export function createEnemyEntity(
	world: GameWorld,
	x: number,
	y: number,
	type: number,
	speed: number,
) {
	const { Position, Velocity, Enemy } = world.components;
	const eid = addEntity(world);

	addComponent(world, eid, Position);
	addComponent(world, eid, Velocity);
	addComponent(world, eid, Enemy);

	Position.x[eid] = x;
	Position.y[eid] = y;
	Velocity.x[eid] = -speed;
	Velocity.y[eid] = 0;
	Enemy.type[eid] = type;
	Enemy.speed[eid] = speed;

	return eid;
}

export function destroyEntity(world: GameWorld, eid: number) {
	removeEntity(world, eid);
}

// ============================================================================
// Queries
// ============================================================================

export function getPlayers(world: GameWorld) {
	const { Position, Velocity, Player } = world.components;
	return query(world, [Position, Velocity, Player]);
}

export function getPlatforms(world: GameWorld) {
	const { Position, Platform } = world.components;
	return query(world, [Position, Platform]);
}

export function getEnemies(world: GameWorld) {
	const { Position, Velocity, Enemy } = world.components;
	return query(world, [Position, Velocity, Enemy]);
}

// ============================================================================
// Re-exports
// ============================================================================

export { hasComponent };
