import { MAX_ENTITIES } from './shared';

export const MovementTag: Record<string, never> = {};

export const Movement = {
	baseSpeed: new Float32Array(MAX_ENTITIES),
	speed: new Float32Array(MAX_ENTITIES),
	frozen: new Uint8Array(MAX_ENTITIES),
};

export function initMovement(eid: number, baseSpeed: number): void {
	Movement.baseSpeed[eid] = baseSpeed;
	Movement.speed[eid] = baseSpeed;
	Movement.frozen[eid] = 0;
}
