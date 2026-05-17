import type Phaser from 'phaser';
import type {
	ArmourySpec,
	BatterySpec,
	GeneratorSpec,
	RepairSpec,
	TowerSpec,
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

export interface TowerUpgrades {
	radar: number;
	attack: number;
	speed: number;
	armor: number;
}

export interface FixedTarget {
	x: number;
	y: number;
	marker: Phaser.GameObjects.Graphics;
}

export interface TowerBuilding extends BaseBuilding {
	kind: 'tower';
	spec: TowerSpec;
	lastFireAtMs: number;
	online: boolean;
	powerIndicator: Phaser.GameObjects.Arc;
	upgrades: TowerUpgrades;
	fixedTarget: FixedTarget | null;
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
	activeDroneEid: number | null;
}

export interface ArmouryBuilding extends BaseBuilding {
	kind: 'armoury';
	spec: ArmourySpec;
	online: boolean;
	powerIndicator: Phaser.GameObjects.Arc;
	nextSpawnAtMs: number;
}

export type Building =
	| TowerBuilding
	| GeneratorBuilding
	| BatteryBuilding
	| RepairBuilding
	| ArmouryBuilding;

export interface Projectile {
	sprite: Phaser.GameObjects.Arc;
	tower: TowerBuilding;
	startX: number;
	startY: number;
	targetX: number;
	targetY: number;
	enemyId: number | null;
	speed: number;
	alive: boolean;
	homing: boolean;
	arcHeight: number;
	traveled: number;
	totalDist: number;
}

export interface BurnPatch {
	sprite: Phaser.GameObjects.Arc;
	x: number;
	y: number;
	radius: number;
	dps: number;
	expiresAtMs: number;
}
