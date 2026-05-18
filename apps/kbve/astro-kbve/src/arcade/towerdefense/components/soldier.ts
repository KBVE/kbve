import type Phaser from 'phaser';
import { MAX_ENTITIES } from './shared';

export const SoldierTag: Record<string, never> = {};

export const SoldierStats = {
	speed: new Float32Array(MAX_ENTITIES),
	attackDamage: new Float32Array(MAX_ENTITIES),
	attackRateMs: new Float32Array(MAX_ENTITIES),
	attackRange: new Float32Array(MAX_ENTITIES),
	lastAttackAtMs: new Float32Array(MAX_ENTITIES),
	targetEnemyEid: new Int32Array(MAX_ENTITIES),
	armouryEid: new Int32Array(MAX_ENTITIES),
	expiresAtWave: new Int32Array(MAX_ENTITIES),
};

export interface SoldierVisual {
	sprite: Phaser.GameObjects.Rectangle;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
}
