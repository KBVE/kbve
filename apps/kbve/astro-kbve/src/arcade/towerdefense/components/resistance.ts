import { MAX_ENTITIES } from './shared';

export const ResistanceTag: Record<string, never> = {};

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

export const Resistance = {
	kinetic: new Float32Array(MAX_ENTITIES),
	explosive: new Float32Array(MAX_ENTITIES),
	fire: new Float32Array(MAX_ENTITIES),
	cold: new Float32Array(MAX_ENTITIES),
	energy: new Float32Array(MAX_ENTITIES),
};

export function initResistance(eid: number): void {
	Resistance.kinetic[eid] = 1;
	Resistance.explosive[eid] = 1;
	Resistance.fire[eid] = 1;
	Resistance.cold[eid] = 1;
	Resistance.energy[eid] = 1;
}

export function resistForType(eid: number, type: number): number {
	switch (type) {
		case DAMAGE_TYPE.kinetic:
			return Resistance.kinetic[eid];
		case DAMAGE_TYPE.explosive:
			return Resistance.explosive[eid];
		case DAMAGE_TYPE.fire:
			return Resistance.fire[eid];
		case DAMAGE_TYPE.cold:
			return Resistance.cold[eid];
		case DAMAGE_TYPE.energy:
			return Resistance.energy[eid];
		default:
			return 1;
	}
}
