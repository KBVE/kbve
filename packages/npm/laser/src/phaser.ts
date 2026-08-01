// Phaser subpath: every laser module that imports phaser at runtime, plus the
// Rapier connector that only Phaser games use. Kept out of the main barrel so a
// consumer that never boots Phaser (herbmail) does not drag those optional peers
// into its module graph.

export { PhaserGame } from './lib/phaser/PhaserGame';
export type { PhaserGameProps, PhaserGameRef } from './lib/phaser/PhaserGame';
export { PhaserContext, usePhaserGame } from './lib/phaser/use-phaser';
export { usePhaserEvent } from './lib/phaser/use-phaser-event';
export { PlayerController } from './lib/phaser/player-controller';
export { VirtualJoystick } from './lib/phaser/virtual-joystick';
export type { VirtualJoystickConfig } from './lib/phaser/virtual-joystick';
export {
	flashEntity,
	floatingText,
	drawHealthBar,
	drawHealthBarCached,
	attachCameraZoom,
} from './lib/phaser/entity-fx';
export type { CameraZoomOptions } from './lib/phaser/entity-fx';
export {
	createGpuSpriteLayer,
	populateGpuSpriteLayer,
} from './lib/phaser/gpu-sprite-layer';
export type {
	GpuSpriteLayerOptions,
	GpuSpriteLayerHandle,
} from './lib/phaser/gpu-sprite-layer';
export {
	createDustMoteLayer,
	createWorldDustLayer,
	dustMemberAt,
} from './lib/phaser/ambient-dust';
export type {
	DustMoteOptions,
	WorldDustHandle,
	WorldDustOptions,
} from './lib/phaser/ambient-dust';
export { GameObjectPool } from './lib/phaser/object-pool';
export { setupKeyboardMap } from './lib/phaser/keyboard-map';
export type { KeyboardMap } from './lib/phaser/keyboard-map';
export {
	createArrowPool,
	animateArrowProjectile,
} from './lib/phaser/arrow-projectile';
export type {
	ArrowPool,
	ArrowPoolOptions,
	ArrowShot,
} from './lib/phaser/arrow-projectile';
export {
	getBirdNum,
	isBird,
	createBirdSprites,
	createShadowSprites,
	createBirdAnimation,
} from './lib/phaser/monsters/bird';

export { RAPIER, createRapierPhysics } from './lib/physics/rapier';
