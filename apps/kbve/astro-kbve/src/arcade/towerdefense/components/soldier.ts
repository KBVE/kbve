import type Phaser from 'phaser';
import { MAX_ENTITIES } from './shared';

export const SoldierTag: Record<string, never> = {};

export const SOLDIER_KIND = {
	melee: 0,
	archer: 1,
} as const;
export type SoldierKind = (typeof SOLDIER_KIND)[keyof typeof SOLDIER_KIND];

export const SoldierStats = {
	speed: new Float32Array(MAX_ENTITIES),
	attackDamage: new Float32Array(MAX_ENTITIES),
	attackRateMs: new Float32Array(MAX_ENTITIES),
	attackRange: new Float32Array(MAX_ENTITIES),
	lastAttackAtMs: new Float32Array(MAX_ENTITIES),
	targetEnemyEid: new Int32Array(MAX_ENTITIES),
	armouryEid: new Int32Array(MAX_ENTITIES),
	expiresAtWave: new Int32Array(MAX_ENTITIES),
	unitKind: new Uint8Array(MAX_ENTITIES),
};

export interface SoldierVisual {
	idleTween?: Phaser.Tweens.Tween;
	yBase?: number;
	lastX: number;
	lastY: number;
	walkPhase: number;
	facing: number;
	sprite: Phaser.GameObjects.Image;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
}
