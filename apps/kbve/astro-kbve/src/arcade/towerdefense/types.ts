import type Phaser from 'phaser';
import type {
	BatterySpec,
	GeneratorSpec,
	RepairSpec,
	TowerSpec,
	WireSpec,
} from './config';

export interface BaseBuilding {
	id: number;
	col: number;
	row: number;
	x: number;
	y: number;
	hp: number;
	maxHp: number;
	sprite: Phaser.GameObjects.Rectangle;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
	destroyed: boolean;
}

export interface TowerBuilding extends BaseBuilding {
	kind: 'tower';
	spec: TowerSpec;
	lastFireAtMs: number;
	online: boolean;
	powerIndicator: Phaser.GameObjects.Arc;
}

export interface GeneratorBuilding extends BaseBuilding {
	kind: 'generator';
	spec: GeneratorSpec;
	online: boolean;
}

export interface BatteryBuilding extends BaseBuilding {
	kind: 'battery';
	spec: BatterySpec;
	charge: number;
	capacity: number;
	chargeBar: Phaser.GameObjects.Rectangle;
	chargeBarBg: Phaser.GameObjects.Rectangle;
}

export interface RepairBuilding extends BaseBuilding {
	kind: 'repair';
	spec: RepairSpec;
	online: boolean;
	powerIndicator: Phaser.GameObjects.Arc;
	cooldownLeftMs: number;
	activeDrone: RepairDrone | null;
}

export interface WireBuilding extends BaseBuilding {
	kind: 'wire';
	spec: WireSpec;
	powered: boolean;
}

export type Building =
	| TowerBuilding
	| GeneratorBuilding
	| BatteryBuilding
	| RepairBuilding
	| WireBuilding;

export interface Enemy {
	sprite: Phaser.GameObjects.Arc;
	statusRing: Phaser.GameObjects.Arc;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
	hp: number;
	maxHp: number;
	baseSpeed: number;
	pathIndex: number;
	alive: boolean;
	slowUntilMs: number;
	slowFactor: number;
	burnUntilMs: number;
	burnDps: number;
	attackDamage: number;
	attackTarget: Building | null;
	lastAttackAtMs: number;
}

export interface Projectile {
	sprite: Phaser.GameObjects.Arc;
	tower: TowerBuilding;
	targetX: number;
	targetY: number;
	enemy: Enemy | null;
	speed: number;
	alive: boolean;
}

export interface BurnPatch {
	sprite: Phaser.GameObjects.Arc;
	x: number;
	y: number;
	radius: number;
	dps: number;
	expiresAtMs: number;
}

export interface RepairDrone {
	sprite: Phaser.GameObjects.Arc;
	beam: Phaser.GameObjects.Graphics;
	station: RepairBuilding;
	target: Building;
	x: number;
	y: number;
	speed: number;
	state: 'outbound' | 'returning';
	alive: boolean;
}
