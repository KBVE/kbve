import type Phaser from 'phaser';
import type { EnemyTypeId } from '../config';
import type { Building } from '../types';

export const EnemyTag: Record<string, never> = {};

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

export type AttackTarget =
	| { kind: 'building'; b: Building }
	| { kind: 'soldier'; eid: number };

export interface EnemyVisual {
	sprite: Phaser.GameObjects.Arc;
	statusRing: Phaser.GameObjects.Graphics;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
	ringRadius: number;
	statusVisible: boolean;
	attackTarget: AttackTarget | null;
}
