import { MAX_ENTITIES } from './shared';

export const DamageableTag: Record<string, never> = {};

export const DAMAGEABLE_KIND = {
	enemy: 0,
	building: 1,
	soldier: 2,
} as const;
export type DamageableKind =
	(typeof DAMAGEABLE_KIND)[keyof typeof DAMAGEABLE_KIND];

export const DAMAGE_TYPE = {
	kinetic: 0,
	explosive: 1,
	fire: 2,
	cold: 3,
	energy: 4,
} as const;
export type DamageType = (typeof DAMAGE_TYPE)[keyof typeof DAMAGE_TYPE];

export const DAMAGE_FLAG = {
	none: 0,
	pierce: 1 << 0,
	ignoresArmor: 1 << 1,
	crit: 1 << 2,
} as const;

export const Damageable = {
	hp: new Float32Array(MAX_ENTITIES),
	maxHp: new Float32Array(MAX_ENTITIES),
	armor: new Float32Array(MAX_ENTITIES),
	maxArmor: new Float32Array(MAX_ENTITIES),
	defense: new Float32Array(MAX_ENTITIES),
	kind: new Uint8Array(MAX_ENTITIES),
	resistKinetic: new Float32Array(MAX_ENTITIES),
	resistExplosive: new Float32Array(MAX_ENTITIES),
	resistFire: new Float32Array(MAX_ENTITIES),
	resistCold: new Float32Array(MAX_ENTITIES),
	resistEnergy: new Float32Array(MAX_ENTITIES),
};

export function resistForType(eid: number, type: number): number {
	switch (type) {
		case DAMAGE_TYPE.kinetic:
			return Damageable.resistKinetic[eid];
		case DAMAGE_TYPE.explosive:
			return Damageable.resistExplosive[eid];
		case DAMAGE_TYPE.fire:
			return Damageable.resistFire[eid];
		case DAMAGE_TYPE.cold:
			return Damageable.resistCold[eid];
		case DAMAGE_TYPE.energy:
			return Damageable.resistEnergy[eid];
		default:
			return 1;
	}
}

export function initDamageable(
	eid: number,
	hp: number,
	armor: number,
	defense: number,
	kind: DamageableKind,
): void {
	Damageable.hp[eid] = hp;
	Damageable.maxHp[eid] = hp;
	Damageable.armor[eid] = armor;
	Damageable.maxArmor[eid] = armor;
	Damageable.defense[eid] = defense;
	Damageable.kind[eid] = kind;
	Damageable.resistKinetic[eid] = 1;
	Damageable.resistExplosive[eid] = 1;
	Damageable.resistFire[eid] = 1;
	Damageable.resistCold[eid] = 1;
	Damageable.resistEnergy[eid] = 1;
}
