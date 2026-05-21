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
	baseSpeed: new Float32Array(MAX_ENTITIES),
	pathIndex: new Int32Array(MAX_ENTITIES),
	segmentT: new Float32Array(MAX_ENTITIES),
	attackDamage: new Float32Array(MAX_ENTITIES),
	attackRateMs: new Float32Array(MAX_ENTITIES),
	attackRange: new Float32Array(MAX_ENTITIES),
	lastAttackAtMs: new Float32Array(MAX_ENTITIES),
	canAttack: new Uint8Array(MAX_ENTITIES),
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
	'flying',
];

export function enemyTypeIndexFromId(id: EnemyTypeId): number {
	const i = ENEMY_TYPE_INDEX.indexOf(id);
	return i >= 0 ? i : 0;
}

export interface EnemyVisual {
	sprite: Phaser.GameObjects.Image;
	statusRing: Phaser.GameObjects.Graphics;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
	ringRadius: number;
	barWidth: number;
	statusVisible: boolean;
	lastX: number;
	lastY: number;
	walkPhase: number;
	facing: number;
}
