import type Phaser from 'phaser';
import type { EnemyTypeId } from '../config';

export const EnemyTag: Record<string, never> = {};

export const ATTACK_TARGET_KIND = {
	none: 0,
	building: 1,
	soldier: 2,
} as const;

export const EnemyStats = {
	hp: [] as number[],
	maxHp: [] as number[],
	baseSpeed: [] as number[],
	pathIndex: [] as number[],
	segmentT: [] as number[],
	slowUntilMs: [] as number[],
	slowDurationMs: [] as number[],
	slowFactor: [] as number[],
	burnUntilMs: [] as number[],
	burnDps: [] as number[],
	attackDamage: [] as number[],
	attackRateMs: [] as number[],
	attackRange: [] as number[],
	lastAttackAtMs: [] as number[],
	canAttack: [] as number[],
	defense: [] as number[],
	bountyMultiplier: [] as number[],
	typeIndex: [] as number[],
	targetEid: [] as number[],
	targetKind: [] as number[],
};

export const ENEMY_TYPE_INDEX: EnemyTypeId[] = [
	'runner',
	'scout',
	'brute',
	'boss',
];

export function enemyTypeIndexFromId(id: EnemyTypeId): number {
	const i = ENEMY_TYPE_INDEX.indexOf(id);
	return i >= 0 ? i : 0;
}

export interface EnemyVisual {
	sprite: Phaser.GameObjects.Arc;
	statusRing: Phaser.GameObjects.Graphics;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
	ringRadius: number;
	statusVisible: boolean;
}
