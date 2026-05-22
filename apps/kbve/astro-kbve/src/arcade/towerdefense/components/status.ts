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

export function stackBurn(
	eid: number,
	expiresAtMs: number,
	addDps: number,
	maxDps: number,
): void {
	const expires = StatusState.expiresAtMs[STATUS_KIND.burn];
	const mag = StatusState.magnitude[STATUS_KIND.burn];
	const active = expires[eid] > 0 && expires[eid] >= expiresAtMs - 1000;
	const base = active ? mag[eid] : 0;
	const next = Math.min(maxDps, base + addDps);
	if (expires[eid] < expiresAtMs) expires[eid] = expiresAtMs;
	mag[eid] = next;
}

export function stackSlow(
	eid: number,
	expiresAtMs: number,
	factor: number,
	durationMs: number,
	minFactor: number,
): void {
	const expires = StatusState.expiresAtMs[STATUS_KIND.slow];
	const mag = StatusState.magnitude[STATUS_KIND.slow];
	const extra = StatusState.extra[STATUS_KIND.slow];
	const active = expires[eid] > 0 && expires[eid] >= expiresAtMs - 1000;
	const base = active && mag[eid] > 0 ? mag[eid] : 1;
	const compounded = Math.max(minFactor, base * factor);
	if (expires[eid] < expiresAtMs) expires[eid] = expiresAtMs;
	mag[eid] = compounded;
	extra[eid] = durationMs;
}

export function clearStatus(eid: number, kind: number): void {
	StatusState.expiresAtMs[kind][eid] = 0;
	StatusState.magnitude[kind][eid] = 0;
	StatusState.extra[kind][eid] = 0;
}
