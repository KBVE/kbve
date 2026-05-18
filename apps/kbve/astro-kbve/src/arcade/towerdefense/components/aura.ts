import { MAX_ENTITIES } from './shared';

export const AuraEmitterTag: Record<string, never> = {};

export const AURA_KIND = {
	repairArmor: 0,
	buffDamage: 1,
	slowField: 2,
	healHp: 3,
} as const;
export type AuraKind = (typeof AURA_KIND)[keyof typeof AURA_KIND];

export const AuraEmitter = {
	kind: new Uint8Array(MAX_ENTITIES),
	range: new Float32Array(MAX_ENTITIES),
	magnitude: new Float32Array(MAX_ENTITIES),
	intervalMs: new Float32Array(MAX_ENTITIES),
	nextTickAtMs: new Float32Array(MAX_ENTITIES),
};

export function initAura(
	eid: number,
	kind: number,
	range: number,
	magnitude: number,
	intervalMs: number,
): void {
	AuraEmitter.kind[eid] = kind;
	AuraEmitter.range[eid] = range;
	AuraEmitter.magnitude[eid] = magnitude;
	AuraEmitter.intervalMs[eid] = intervalMs;
	AuraEmitter.nextTickAtMs[eid] = 0;
}
