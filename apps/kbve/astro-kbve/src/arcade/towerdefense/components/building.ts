import type { BuildId } from '../config';
import { MAX_ENTITIES } from './shared';

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
	'wall',
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
	online: new Uint8Array(MAX_ENTITIES),
	destroyed: new Uint8Array(MAX_ENTITIES),
	col: new Int32Array(MAX_ENTITIES),
	row: new Int32Array(MAX_ENTITIES),
	specIndex: new Uint8Array(MAX_ENTITIES),
	kindIndex: new Uint8Array(MAX_ENTITIES),
	power: new Float32Array(MAX_ENTITIES),
};

export const TowerState = {
	lastFireAtMs: new Float32Array(MAX_ENTITIES),
	hasFixedTarget: new Uint8Array(MAX_ENTITIES),
	fixedTargetX: new Float32Array(MAX_ENTITIES),
	fixedTargetY: new Float32Array(MAX_ENTITIES),
};

export const TowerUpgradeStats = {
	radar: new Uint8Array(MAX_ENTITIES),
	attack: new Uint8Array(MAX_ENTITIES),
	speed: new Uint8Array(MAX_ENTITIES),
	armor: new Uint8Array(MAX_ENTITIES),
};

export const BatteryState = {
	charge: new Float32Array(MAX_ENTITIES),
	capacity: new Float32Array(MAX_ENTITIES),
};

export const RepairState = {
	cooldownLeftMs: new Float32Array(MAX_ENTITIES),
	activeDroneEid: new Int32Array(MAX_ENTITIES),
};

export const RepairUpgradeStats = {
	reach: new Uint8Array(MAX_ENTITIES),
	yield: new Uint8Array(MAX_ENTITIES),
	tempo: new Uint8Array(MAX_ENTITIES),
};

export const ArmouryState = {
	nextSpawnAtMs: new Float32Array(MAX_ENTITIES),
};

export const ArmouryUpgradeStats = {
	capacity: new Uint8Array(MAX_ENTITIES),
	damage: new Uint8Array(MAX_ENTITIES),
	vigor: new Uint8Array(MAX_ENTITIES),
	tempo: new Uint8Array(MAX_ENTITIES),
};
