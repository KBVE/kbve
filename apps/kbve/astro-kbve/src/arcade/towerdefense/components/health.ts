import { MAX_ENTITIES } from './shared';

export const HealthTag: Record<string, never> = {};

export const Health = {
	hp: new Float32Array(MAX_ENTITIES),
	maxHp: new Float32Array(MAX_ENTITIES),
};

export function initHealth(eid: number, hp: number): void {
	Health.hp[eid] = hp;
	Health.maxHp[eid] = hp;
}
