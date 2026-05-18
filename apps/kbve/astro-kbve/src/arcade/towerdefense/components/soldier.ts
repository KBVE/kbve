import type Phaser from 'phaser';

export const SoldierTag: Record<string, never> = {};

export const SoldierStats = {
	hp: [] as number[],
	maxHp: [] as number[],
	speed: [] as number[],
	attackDamage: [] as number[],
	attackRateMs: [] as number[],
	attackRange: [] as number[],
	lastAttackAtMs: [] as number[],
	targetEnemyEid: [] as number[],
	armouryEid: [] as number[],
};

export interface SoldierVisual {
	sprite: Phaser.GameObjects.Rectangle;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
}
