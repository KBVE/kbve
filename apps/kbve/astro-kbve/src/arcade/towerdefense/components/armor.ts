import { MAX_ENTITIES } from './shared';

export const ArmorTag: Record<string, never> = {};

export const Armor = {
	armor: new Float32Array(MAX_ENTITIES),
	maxArmor: new Float32Array(MAX_ENTITIES),
};

export function initArmor(eid: number, armor: number): void {
	Armor.armor[eid] = armor;
	Armor.maxArmor[eid] = armor;
}
