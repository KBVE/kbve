import { MAX_ENTITIES } from './shared';

export const STATUS_KIND = {
	slow: 0,
	burn: 1,
	stun: 2,
} as const;
export type StatusKind = (typeof STATUS_KIND)[keyof typeof STATUS_KIND];

const STATUS_KIND_COUNT = 3;

function makeKindTable(): Float32Array[] {
	const tables: Float32Array[] = new Array(STATUS_KIND_COUNT);
	for (let i = 0; i < STATUS_KIND_COUNT; i++) {
		tables[i] = new Float32Array(MAX_ENTITIES);
	}
	return tables;
}

export const StatusState = {
	expiresAtMs: makeKindTable(),
	magnitude: makeKindTable(),
	extra: makeKindTable(),
};

export function applyStatus(
	eid: number,
	kind: number,
	expiresAtMs: number,
	magnitude: number,
	extra: number = 0,
): void {
	const expires = StatusState.expiresAtMs[kind];
	if (expires[eid] < expiresAtMs) expires[eid] = expiresAtMs;
	StatusState.magnitude[kind][eid] = magnitude;
	StatusState.extra[kind][eid] = extra;
}

export function hasStatus(eid: number, kind: number, nowMs: number): boolean {
	return StatusState.expiresAtMs[kind][eid] > nowMs;
}

export function statusMagnitude(eid: number, kind: number): number {
	return StatusState.magnitude[kind][eid];
}

export function statusExtra(eid: number, kind: number): number {
	return StatusState.extra[kind][eid];
}

export function statusExpiresAt(eid: number, kind: number): number {
	return StatusState.expiresAtMs[kind][eid];
}

export function clearStatus(eid: number, kind: number): void {
	StatusState.expiresAtMs[kind][eid] = 0;
	StatusState.magnitude[kind][eid] = 0;
	StatusState.extra[kind][eid] = 0;
}
