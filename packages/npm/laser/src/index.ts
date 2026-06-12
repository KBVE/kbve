// Core
export { LaserEventBus, laserEvents } from './lib/core/events';
export type {
	LaserGameConfig,
	GameStatus,
	LaserEventMap,
	Point2D,
	Bounds2D,
	Bounds,
	Range,
	GridDirection,
	CharacterEventData,
	NotificationEventData,
} from './lib/core/types';

// Spatial
export { Quadtree } from './lib/spatial/quadtree';

// Phaser
export { PhaserGame } from './lib/phaser/PhaserGame';
export type { PhaserGameProps, PhaserGameRef } from './lib/phaser/PhaserGame';
export { PhaserContext, usePhaserGame } from './lib/phaser/use-phaser';
export { usePhaserEvent } from './lib/phaser/use-phaser-event';
export { PlayerController } from './lib/phaser/player-controller';
export { VirtualJoystick } from './lib/phaser/virtual-joystick';
export type { VirtualJoystickConfig } from './lib/phaser/virtual-joystick';
export {
	getBirdNum,
	isBird,
	createBirdSprites,
	createShadowSprites,
	createBirdAnimation,
} from './lib/phaser/monsters/bird';

// R3F
export { Stage } from './lib/r3f/components/Stage';
export type { StageProps } from './lib/r3f/components/Stage';
export { useGameLoop } from './lib/r3f/hooks/use-game-loop';

// ECS (bitecs) — full re-export of bitecs core API
export * from './lib/ecs/bitecs';

// ECS helpers (spatial queries, side-map for managed refs)
export {
	SideMap,
	nearestInRange,
	queryInRange,
	type PositionLike,
} from './lib/ecs/helpers';

// Physics (Rapier)
export { RAPIER, createRapierPhysics } from './lib/physics/rapier';

// Net — WS client speaking the simgrid JSON wire
export { GameClient } from './lib/net/game-client';
export type {
	GameClientOptions,
	GameClientEventMap,
} from './lib/net/game-client';
export {
	PROTOCOL_VERSION,
	OWNER_NONE,
	ACTION_ATTACK,
	ACTION_PICKUP,
	EPHEMERAL_INVENTORY,
	EPHEMERAL_COMBAT,
	EPHEMERAL_PICKUP,
	KIND_CAT_PLAYER,
	KIND_CAT_NPC,
	KIND_CAT_ITEM,
	joinFrame,
	inputFrame,
	decodeEphemeralPayload,
} from './lib/net/protocol';
export type {
	Dir,
	Facing,
	Tile,
	Input,
	ClientMessage,
	ServerEvent,
	Snapshot,
	EntityDelta,
	PlayerView,
	Welcome,
	JoinMatch,
	ClientFrame,
	KindEntry,
	Ephemeral,
	InventoryItem,
	InventorySync,
	CombatEvent,
	PickupEvent,
} from './lib/net/protocol';
