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
	sprite: Phaser.GameObjects.Rectangle;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
}

export interface FixedTarget {
	x: number;
	y: number;
	marker: Phaser.GameObjects.Graphics;
}

export interface TowerBuilding extends BaseBuilding {
	kind: 'tower';
	spec: TowerSpec;
	powerIndicator: Phaser.GameObjects.Arc;
	fixedTarget: FixedTarget | null;
	upgradePips: Phaser.GameObjects.Graphics;
}

export interface GeneratorBuilding extends BaseBuilding {
	kind: 'generator';
	spec: GeneratorSpec;
}

export interface BatteryBuilding extends BaseBuilding {
	kind: 'battery';
	spec: BatterySpec;
	chargeBar: Phaser.GameObjects.Rectangle;
	chargeBarBg: Phaser.GameObjects.Rectangle;
}

export interface RepairBuilding extends BaseBuilding {
	kind: 'repair';
	spec: RepairSpec;
	powerIndicator: Phaser.GameObjects.Arc;
}

export interface ArmouryBuilding extends BaseBuilding {
	kind: 'armoury';
	spec: ArmourySpec;
	powerIndicator: Phaser.GameObjects.Arc;
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
