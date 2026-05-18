import type { BuildId } from '../config';

export const BuildingTag: Record<string, never> = {};
export const TowerTag: Record<string, never> = {};
export const GeneratorTag: Record<string, never> = {};
export const BatteryTag: Record<string, never> = {};
export const RepairTag: Record<string, never> = {};
export const ArmouryTag: Record<string, never> = {};

export const BUILDING_KIND = {
	tower: 0,
	generator: 1,
	battery: 2,
	repair: 3,
	armoury: 4,
} as const;
export type BuildingKindIndex =
	(typeof BUILDING_KIND)[keyof typeof BUILDING_KIND];

const BUILD_ID_LIST: BuildId[] = [
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
export const BUILDING_TYPE_INDEX: Record<BuildId, number> = (() => {
	const out: Record<string, number> = {};
	for (let i = 0; i < BUILD_ID_LIST.length; i++) out[BUILD_ID_LIST[i]] = i;
	return out as Record<BuildId, number>;
})();
export function buildIdFromIndex(i: number): BuildId {
	return BUILD_ID_LIST[i];
}
export function buildIndexFromId(id: BuildId): number {
	return BUILDING_TYPE_INDEX[id];
}

export const BuildingState = {
	hp: [] as number[],
	maxHp: [] as number[],
	online: [] as number[],
	destroyed: [] as number[],
	col: [] as number[],
	row: [] as number[],
	specIndex: [] as number[],
	kindIndex: [] as number[],
	power: [] as number[],
};

export const TowerState = {
	lastFireAtMs: [] as number[],
	hasFixedTarget: [] as number[],
	fixedTargetX: [] as number[],
	fixedTargetY: [] as number[],
};

export const TowerUpgradeStats = {
	radar: [] as number[],
	attack: [] as number[],
	speed: [] as number[],
	armor: [] as number[],
};

export const BatteryState = {
	charge: [] as number[],
	capacity: [] as number[],
};

export const RepairState = {
	cooldownLeftMs: [] as number[],
	activeDroneEid: [] as number[],
};

export const RepairUpgradeStats = {
	reach: [] as number[],
	yield: [] as number[],
	tempo: [] as number[],
};

export const ArmouryState = {
	nextSpawnAtMs: [] as number[],
};

export const ArmouryUpgradeStats = {
	capacity: [] as number[],
	damage: [] as number[],
	vigor: [] as number[],
	tempo: [] as number[],
};
