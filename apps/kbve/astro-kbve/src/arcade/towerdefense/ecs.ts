import type Phaser from 'phaser';
import { type EnemyTypeId } from './config';
import type { Building } from './types';

export const Position = { x: [] as number[], y: [] as number[] };

export const EnemyTag: Record<string, never> = {};

export const EnemyStats = {
	hp: [] as number[],
	maxHp: [] as number[],
	baseSpeed: [] as number[],
	pathIndex: [] as number[],
	slowUntilMs: [] as number[],
	slowDurationMs: [] as number[],
	slowFactor: [] as number[],
	burnUntilMs: [] as number[],
	burnDps: [] as number[],
	attackDamage: [] as number[],
	attackRateMs: [] as number[],
	lastAttackAtMs: [] as number[],
	canAttack: [] as number[],
	bountyMultiplier: [] as number[],
	typeIndex: [] as number[],
};

export const ENEMY_TYPE_INDEX: EnemyTypeId[] = ['runner', 'scout', 'brute'];

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
	attackTarget: AttackTarget | null;
}

export const BuildingTag: Record<string, never> = {};
export const TowerTag: Record<string, never> = {};
export const GeneratorTag: Record<string, never> = {};
export const BatteryTag: Record<string, never> = {};
export const RepairTag: Record<string, never> = {};
export const ArmouryTag: Record<string, never> = {};

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

export const DroneTag: Record<string, never> = {};

export const enum DroneState {
	Outbound = 0,
	Returning = 1,
}

export const DroneStats = {
	speed: [] as number[],
	state: [] as number[],
};

export interface DroneVisual {
	sprite: Phaser.GameObjects.Arc;
	beam: Phaser.GameObjects.Graphics;
	station: Building;
	target: Building;
	repairAmount: number;
}
