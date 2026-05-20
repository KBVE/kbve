import type Phaser from 'phaser';
import type {
	ArmourySpec,
	BatterySpec,
	CastleSpec,
	GeneratorSpec,
	RepairSpec,
	TowerSpec,
	VillageSpec,
} from './config';

export interface BaseBuilding {
	id: number;
	col: number;
	row: number;
	x: number;
	y: number;
	sprite: Phaser.GameObjects.Image;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
	armorBar: Phaser.GameObjects.Rectangle;
	armorBarBg: Phaser.GameObjects.Rectangle;
}

export interface TowerBuilding extends BaseBuilding {
	kind: 'tower';
	spec: TowerSpec;
	powerIndicator: Phaser.GameObjects.Arc;
	fixedTargetMarker: Phaser.GameObjects.Graphics | null;
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

export interface VillageBuilding extends BaseBuilding {
	kind: 'village';
	spec: VillageSpec;
	powerIndicator: Phaser.GameObjects.Arc;
}

export interface CastleBuilding extends BaseBuilding {
	kind: 'castle';
	spec: CastleSpec;
	powerIndicator: Phaser.GameObjects.Arc;
}

export type Building =
	| TowerBuilding
	| GeneratorBuilding
	| BatteryBuilding
	| RepairBuilding
	| ArmouryBuilding
	| VillageBuilding
	| CastleBuilding;
