import type Phaser from 'phaser';

export const ProjectileTag: Record<string, never> = {};

export const ProjectileStats = {
	startX: [] as number[],
	startY: [] as number[],
	targetX: [] as number[],
	targetY: [] as number[],
	traveled: [] as number[],
	totalDist: [] as number[],
	speed: [] as number[],
	arcHeight: [] as number[],
	homing: [] as number[],
	enemyEid: [] as number[],
	damage: [] as number[],
	burnDps: [] as number[],
	burnMs: [] as number[],
	burnRadius: [] as number[],
	splashRadius: [] as number[],
	slowMs: [] as number[],
	slowFactor: [] as number[],
};

export interface ProjectileVisual {
	sprite: Phaser.GameObjects.Arc;
}
