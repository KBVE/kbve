import type Phaser from 'phaser';
import { MAX_ENTITIES } from './shared';

export const ProjectileTag: Record<string, never> = {};

export const ProjectileStats = {
	startX: new Float32Array(MAX_ENTITIES),
	startY: new Float32Array(MAX_ENTITIES),
	targetX: new Float32Array(MAX_ENTITIES),
	targetY: new Float32Array(MAX_ENTITIES),
	traveled: new Float32Array(MAX_ENTITIES),
	totalDist: new Float32Array(MAX_ENTITIES),
	speed: new Float32Array(MAX_ENTITIES),
	arcHeight: new Float32Array(MAX_ENTITIES),
	homing: new Uint8Array(MAX_ENTITIES),
	enemyEid: new Int32Array(MAX_ENTITIES),
	damage: new Float32Array(MAX_ENTITIES),
	burnDps: new Float32Array(MAX_ENTITIES),
	burnMs: new Float32Array(MAX_ENTITIES),
	burnRadius: new Float32Array(MAX_ENTITIES),
	splashRadius: new Float32Array(MAX_ENTITIES),
	slowMs: new Float32Array(MAX_ENTITIES),
	slowFactor: new Float32Array(MAX_ENTITIES),
};

export interface ProjectileVisual {
	sprite: Phaser.GameObjects.Arc;
}
