export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;
export const TILE = 40;
export const COLS = BASE_WIDTH / TILE;
export const ROWS = BASE_HEIGHT / TILE;

export const HUD_ROWS_TOP = 2;
export const HUD_ROWS_BOTTOM = 2;

export const GAME_CONFIG = {
	startingGold: 600,
	startingLives: 20,
	waveDelayMs: 6000,
	enemyBaseHp: 40,
	enemyBaseSpeed: 70,
	enemyHpScale: 1.22,
	enemySpawnIntervalMs: 750,
	enemiesPerWave: 10,
	enemiesPerWaveScale: 1.5,
	goldPerKill: 8,
	enemyBaseAttackDamage: 4,
	enemyAttackDamageScale: 0.6,
	enemyAttackRateMs: 800,
	enemyAttackRange: 32,
	enemyAttackSpeedFactor: 0.6,
	repairAmount: 29,
	repairDroneSpeed: 220,
	repairDroneCooldownMs: 3500,
	armorBuildingRatio: 0.4,
	armorEnemyRatio: 0.35,
	passiveRepairIntervalMs: 1500,
	passiveRepairArmor: 12,
} as const;

export const COLORS = {
	background: 0x0d1117,
	pathFill: 0x2d3748,
	pathBorder: 0x4a5568,
	grass: 0x22543d,
	gridLine: 0x2f4a3a,
	enemy: 0xe53e3e,
	enemyHpBar: 0x48bb78,
	enemyHpBarBg: 0x1a202c,
	buildingHpBar: 0xfbd38d,
	buildingHpBarBg: 0x1a202c,
	hudText: '#f7fafc',
	hudDim: '#a0aec0',
	goldText: '#fbd38d',
	livesText: '#fc8181',
	waveText: '#90cdf4',
	powerOk: '#9ae6b4',
	powerLow: '#fc8181',
	batteryFull: '#f6e05e',
	hudPanel: 0x111827,
	hudPanelBorder: 0x374151,
	previewValid: 0x48bb78,
	previewInvalid: 0xe53e3e,
	paletteBg: 0x0f1620,
	paletteBorder: 0x4a5568,
	paletteSelected: 0xfbd38d,
	statusSlow: 0x63b3ed,
	statusBurn: 0xfc8181,
	burnPatch: 0xfc8181,
	wire: 0xfbd38d,
	wireOff: 0x6b7280,
	repairDrone: 0xfbd38d,
	repairBeam: 0xfbd38d,
} as const;

export type BuildKind =
	| 'tower'
	| 'generator'
	| 'battery'
	| 'repair'
	| 'armoury';

export interface BuildSpecBase {
	id: BuildId;
	name: string;
	kind: BuildKind;
	cost: number;
	maxHp: number;
	defense: number;
	color: number;
}

export interface TowerSpec extends BuildSpecBase {
	kind: 'tower';
	power: number;
	range: number;
	damage: number;
	fireRateMs: number;
	projectileSpeed: number;
	projectileColor: number;
	splashRadius: number;
	slowMs: number;
	slowFactor: number;
	burnDps: number;
	burnMs: number;
	burnRadius: number;
	homing: boolean;
	arcHeight: number;
	avoidSlowed: boolean;
}

export interface GeneratorSpec extends BuildSpecBase {
	kind: 'generator';
	power: number;
}

export interface BatterySpec extends BuildSpecBase {
	kind: 'battery';
	capacity: number;
	chargeRate: number;
}

export interface RepairSpec extends BuildSpecBase {
	kind: 'repair';
	power: number;
	cooldownMs: number;
	repairAmount: number;
	repairRange: number;
}

export interface ArmourySpec extends BuildSpecBase {
	kind: 'armoury';
	power: number;
	spawnIntervalMs: number;
	maxSoldiers: number;
	soldierHp: number;
	soldierDamage: number;
	soldierAttackRateMs: number;
	soldierAttackRange: number;
	soldierSpeed: number;
	soldierColor: number;
	soldierRoamRange: number;
}

export type BuildSpec =
	| TowerSpec
	| GeneratorSpec
	| BatterySpec
	| RepairSpec
	| ArmourySpec;

export type TowerId = 'basic' | 'bomb' | 'ice' | 'fire' | 'artillery';
export type GeneratorId = 'solar' | 'diesel' | 'nuclear';
export type BatteryId = 'battery';
export type RepairId = 'repair';
export type ArmouryId = 'armoury';
export type BuildId = TowerId | GeneratorId | BatteryId | RepairId | ArmouryId;

export const TOWER_CATALOG: Record<TowerId, TowerSpec> = {
	basic: {
		id: 'basic',
		name: 'Basic',
		kind: 'tower',
		cost: 50,
		maxHp: 320,
		defense: 3,
		power: 1,
		range: 140,
		damage: 12,
		fireRateMs: 600,
		projectileSpeed: 420,
		color: 0x4299e1,
		projectileColor: 0xffd700,
		splashRadius: 0,
		slowMs: 0,
		slowFactor: 1,
		burnDps: 0,
		burnMs: 0,
		burnRadius: 0,
		homing: true,
		arcHeight: 0,
		avoidSlowed: false,
	},
	bomb: {
		id: 'bomb',
		name: 'Bomb',
		kind: 'tower',
		cost: 130,
		maxHp: 420,
		defense: 6,
		power: 3,
		range: 160,
		damage: 28,
		fireRateMs: 1300,
		projectileSpeed: 280,
		color: 0xed8936,
		projectileColor: 0xfbd38d,
		splashRadius: 70,
		slowMs: 0,
		slowFactor: 1,
		burnDps: 0,
		burnMs: 0,
		burnRadius: 0,
		homing: true,
		arcHeight: 0,
		avoidSlowed: false,
	},
	ice: {
		id: 'ice',
		name: 'Ice',
		kind: 'tower',
		cost: 90,
		maxHp: 300,
		defense: 3,
		power: 2,
		range: 150,
		damage: 4,
		fireRateMs: 500,
		projectileSpeed: 450,
		color: 0x63b3ed,
		projectileColor: 0xbee3f8,
		splashRadius: 0,
		slowMs: 1800,
		slowFactor: 0.45,
		burnDps: 0,
		burnMs: 0,
		burnRadius: 0,
		homing: true,
		arcHeight: 0,
		avoidSlowed: true,
	},
	fire: {
		id: 'fire',
		name: 'Fire',
		kind: 'tower',
		cost: 110,
		maxHp: 340,
		defense: 3,
		power: 2,
		range: 120,
		damage: 0,
		fireRateMs: 1100,
		projectileSpeed: 300,
		color: 0xfc8181,
		projectileColor: 0xfeb2b2,
		splashRadius: 0,
		slowMs: 0,
		slowFactor: 1,
		burnDps: 9,
		burnMs: 5500,
		burnRadius: 50,
		homing: true,
		arcHeight: 0,
		avoidSlowed: false,
	},
	artillery: {
		id: 'artillery',
		name: 'Artillery',
		kind: 'tower',
		cost: 260,
		maxHp: 420,
		defense: 6,
		power: 4,
		range: BASE_WIDTH + BASE_HEIGHT,
		damage: 45,
		fireRateMs: 2600,
		projectileSpeed: 380,
		color: 0xa0522d,
		projectileColor: 0xfff5b1,
		splashRadius: 95,
		slowMs: 0,
		slowFactor: 1,
		burnDps: 0,
		burnMs: 0,
		burnRadius: 0,
		homing: false,
		arcHeight: 110,
		avoidSlowed: false,
	},
};

export const GENERATOR_CATALOG: Record<GeneratorId, GeneratorSpec> = {
	solar: {
		id: 'solar',
		name: 'Solar',
		kind: 'generator',
		cost: 60,
		maxHp: 360,
		defense: 5,
		power: 3,
		color: 0xf6e05e,
	},
	diesel: {
		id: 'diesel',
		name: 'Diesel',
		kind: 'generator',
		cost: 160,
		maxHp: 540,
		defense: 7,
		power: 10,
		color: 0xa0aec0,
	},
	nuclear: {
		id: 'nuclear',
		name: 'Nuclear',
		kind: 'generator',
		cost: 520,
		maxHp: 1100,
		defense: 10,
		power: 30,
		color: 0x9ae6b4,
	},
};

export const BATTERY_CATALOG: Record<BatteryId, BatterySpec> = {
	battery: {
		id: 'battery',
		name: 'Battery',
		kind: 'battery',
		cost: 100,
		maxHp: 460,
		defense: 6,
		capacity: 25,
		chargeRate: 6,
		color: 0xd6bcfa,
	},
};

export const REPAIR_CATALOG: Record<RepairId, RepairSpec> = {
	repair: {
		id: 'repair',
		name: 'Repair',
		kind: 'repair',
		cost: 180,
		maxHp: 400,
		defense: 5,
		power: 2,
		cooldownMs: 3500,
		repairAmount: 29,
		repairRange: 280,
		color: 0x68d391,
	},
};

export const ARMOURY_CATALOG: Record<ArmouryId, ArmourySpec> = {
	armoury: {
		id: 'armoury',
		name: 'Armoury',
		kind: 'armoury',
		cost: 220,
		maxHp: 500,
		defense: 6,
		power: 2,
		spawnIntervalMs: 2500,
		maxSoldiers: 5,
		soldierHp: 30,
		soldierDamage: 3,
		soldierAttackRateMs: 800,
		soldierAttackRange: 55,
		soldierSpeed: 90,
		color: 0xb794f4,
		soldierColor: 0xd6bcfa,
		soldierRoamRange: 240,
	},
};

export const PALETTE_ORDER: BuildId[] = [
	'basic',
	'bomb',
	'ice',
	'fire',
	'artillery',
	'solar',
	'diesel',
	'nuclear',
	'battery',
	'repair',
	'armoury',
];

export type UpgradeKind = 'radar' | 'attack' | 'speed' | 'armor';

export interface UpgradeDef {
	id: UpgradeKind;
	name: string;
	description: string;
	color: number;
	baseCost: number;
	maxLevel: number;
	perLevel: number;
}

export const UPGRADE_DEFS: Record<UpgradeKind, UpgradeDef> = {
	radar: {
		id: 'radar',
		name: 'Radar',
		description: 'Range +25%',
		color: 0x90cdf4,
		baseCost: 40,
		maxLevel: 4,
		perLevel: 0.25,
	},
	attack: {
		id: 'attack',
		name: 'Attack',
		description: 'Damage +30%',
		color: 0xfc8181,
		baseCost: 55,
		maxLevel: 4,
		perLevel: 0.3,
	},
	speed: {
		id: 'speed',
		name: 'Speed',
		description: 'Fire rate +15%',
		color: 0xfbd38d,
		baseCost: 60,
		maxLevel: 4,
		perLevel: 0.15,
	},
	armor: {
		id: 'armor',
		name: 'Armor',
		description: 'Max HP +30%',
		color: 0x9ae6b4,
		baseCost: 35,
		maxLevel: 4,
		perLevel: 0.3,
	},
};

export const UPGRADE_ORDER: UpgradeKind[] = [
	'radar',
	'attack',
	'speed',
	'armor',
];

export function upgradeCost(def: UpgradeDef, currentLevel: number): number {
	return Math.floor(def.baseCost * (currentLevel + 1));
}

export type ArmouryUpgradeKind = 'capacity' | 'damage' | 'vigor' | 'tempo';

export interface ArmouryUpgradeDef {
	id: ArmouryUpgradeKind;
	name: string;
	description: string;
	color: number;
	baseCost: number;
	maxLevel: number;
	perLevel: number;
}

export const ARMOURY_UPGRADE_DEFS: Record<
	ArmouryUpgradeKind,
	ArmouryUpgradeDef
> = {
	capacity: {
		id: 'capacity',
		name: 'Capacity',
		description: '+1 soldier slot',
		color: 0xb794f4,
		baseCost: 90,
		maxLevel: 4,
		perLevel: 1,
	},
	damage: {
		id: 'damage',
		name: 'Firepower',
		description: 'Soldier dmg +25%',
		color: 0xfc8181,
		baseCost: 75,
		maxLevel: 4,
		perLevel: 0.25,
	},
	vigor: {
		id: 'vigor',
		name: 'Vigor',
		description: 'Soldier HP +25%',
		color: 0x9ae6b4,
		baseCost: 65,
		maxLevel: 4,
		perLevel: 0.25,
	},
	tempo: {
		id: 'tempo',
		name: 'Tempo',
		description: 'Spawn rate +15%',
		color: 0xfbd38d,
		baseCost: 70,
		maxLevel: 4,
		perLevel: 0.15,
	},
};

export const ARMOURY_UPGRADE_ORDER: ArmouryUpgradeKind[] = [
	'capacity',
	'damage',
	'vigor',
	'tempo',
];

export function armouryUpgradeCost(
	def: ArmouryUpgradeDef,
	currentLevel: number,
): number {
	return Math.floor(def.baseCost * (currentLevel + 1));
}

export type RepairUpgradeKind = 'reach' | 'yield' | 'tempo';

export interface RepairUpgradeDef {
	id: RepairUpgradeKind;
	name: string;
	description: string;
	color: number;
	baseCost: number;
	maxLevel: number;
	perLevel: number;
}

export const REPAIR_UPGRADE_DEFS: Record<RepairUpgradeKind, RepairUpgradeDef> =
	{
		reach: {
			id: 'reach',
			name: 'Reach',
			description: 'Range +25%',
			color: 0x90cdf4,
			baseCost: 70,
			maxLevel: 4,
			perLevel: 0.25,
		},
		yield: {
			id: 'yield',
			name: 'Yield',
			description: 'Heal +25%',
			color: 0x9ae6b4,
			baseCost: 60,
			maxLevel: 4,
			perLevel: 0.25,
		},
		tempo: {
			id: 'tempo',
			name: 'Tempo',
			description: 'Drone rate +15%',
			color: 0xfbd38d,
			baseCost: 65,
			maxLevel: 4,
			perLevel: 0.15,
		},
	};

export const REPAIR_UPGRADE_ORDER: RepairUpgradeKind[] = [
	'reach',
	'yield',
	'tempo',
];

export function repairUpgradeCost(
	def: RepairUpgradeDef,
	currentLevel: number,
): number {
	return Math.floor(def.baseCost * (currentLevel + 1));
}

export function specFor(id: BuildId): BuildSpec {
	if (id in TOWER_CATALOG) return TOWER_CATALOG[id as TowerId];
	if (id in GENERATOR_CATALOG) return GENERATOR_CATALOG[id as GeneratorId];
	if (id in BATTERY_CATALOG) return BATTERY_CATALOG[id as BatteryId];
	if (id in REPAIR_CATALOG) return REPAIR_CATALOG[id as RepairId];
	return ARMOURY_CATALOG[id as ArmouryId];
}

export type EnemyTypeId = 'runner' | 'brute' | 'scout' | 'boss';

export interface EnemyType {
	id: EnemyTypeId;
	name: string;
	color: number;
	hpMultiplier: number;
	speedMultiplier: number;
	attackDamage: number;
	attackRateMs: number;
	attackRange: number;
	defense: number;
	canAttack: boolean;
	sizeRadius: number;
	bountyMultiplier: number;
}

export const ENEMY_CATALOG: Record<EnemyTypeId, EnemyType> = {
	runner: {
		id: 'runner',
		name: 'Runner',
		color: 0xe53e3e,
		hpMultiplier: 1,
		speedMultiplier: 1,
		attackDamage: 3,
		attackRateMs: 900,
		attackRange: 55,
		defense: 0,
		canAttack: true,
		sizeRadius: 0.3,
		bountyMultiplier: 1,
	},
	scout: {
		id: 'scout',
		name: 'Scout',
		color: 0xf6ad55,
		hpMultiplier: 0.6,
		speedMultiplier: 1.5,
		attackDamage: 2,
		attackRateMs: 700,
		attackRange: 50,
		defense: 0,
		canAttack: true,
		sizeRadius: 0.24,
		bountyMultiplier: 0.75,
	},
	brute: {
		id: 'brute',
		name: 'Brute',
		color: 0x9f7aea,
		hpMultiplier: 2.2,
		speedMultiplier: 0.65,
		attackDamage: 7,
		attackRateMs: 800,
		attackRange: 80,
		defense: 4,
		canAttack: true,
		sizeRadius: 0.4,
		bountyMultiplier: 2,
	},
	boss: {
		id: 'boss',
		name: 'Boss',
		color: 0xffd700,
		hpMultiplier: 7,
		speedMultiplier: 0.5,
		attackDamage: 14,
		attackRateMs: 900,
		attackRange: 100,
		defense: 8,
		canAttack: true,
		sizeRadius: 0.55,
		bountyMultiplier: 10,
	},
};

export function rollEnemyType(wave: number): EnemyTypeId {
	const bruteChance = Math.min(0.4, (wave - 1) * 0.07);
	const scoutChance = wave >= 2 ? Math.min(0.25, (wave - 1) * 0.05) : 0;
	const roll = Math.random();
	if (roll < bruteChance) return 'brute';
	if (roll < bruteChance + scoutChance) return 'scout';
	return 'runner';
}
