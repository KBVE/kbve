import type Phaser from 'phaser';
import type { EnemyTypeId } from '../config';
import { MAX_ENTITIES } from './shared';

export const EnemyTag: Record<string, never> = {};

export const ATTACK_TARGET_KIND = {
	none: 0,
	building: 1,
	soldier: 2,
} as const;

export const EnemyStats = {
	hp: new Float32Array(MAX_ENTITIES),
	maxHp: new Float32Array(MAX_ENTITIES),
	baseSpeed: new Float32Array(MAX_ENTITIES),
	pathIndex: new Int32Array(MAX_ENTITIES),
	segmentT: new Float32Array(MAX_ENTITIES),
	slowUntilMs: new Float32Array(MAX_ENTITIES),
	slowDurationMs: new Float32Array(MAX_ENTITIES),
	slowFactor: new Float32Array(MAX_ENTITIES),
	burnUntilMs: new Float32Array(MAX_ENTITIES),
	burnDps: new Float32Array(MAX_ENTITIES),
	attackDamage: new Float32Array(MAX_ENTITIES),
	attackRateMs: new Float32Array(MAX_ENTITIES),
	attackRange: new Float32Array(MAX_ENTITIES),
	lastAttackAtMs: new Float32Array(MAX_ENTITIES),
	canAttack: new Uint8Array(MAX_ENTITIES),
	defense: new Float32Array(MAX_ENTITIES),
	bountyMultiplier: new Float32Array(MAX_ENTITIES),
	typeIndex: new Uint8Array(MAX_ENTITIES),
	targetEid: new Int32Array(MAX_ENTITIES),
	targetKind: new Uint8Array(MAX_ENTITIES),
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
