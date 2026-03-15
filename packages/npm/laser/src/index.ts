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

// ECS (bitecs)
export {
	createWorld,
	addEntity,
	removeEntity,
	addComponent,
	hasComponent,
	query,
} from './lib/ecs/bitecs';

// Physics (Rapier)
export { RAPIER, createRapierPhysics } from './lib/physics/rapier';
