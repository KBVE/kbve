import { MAX_ENTITIES } from './shared';

export const DefenseTag: Record<string, never> = {};

export const Defense = {
	defense: new Float32Array(MAX_ENTITIES),
};

export function initDefense(eid: number, value: number): void {
	Defense.defense[eid] = value;
}
