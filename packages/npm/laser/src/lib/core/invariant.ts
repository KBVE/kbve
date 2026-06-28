import { laserEvents } from './events';

export interface InvariantViolation {
	msg: string;
	ctx?: unknown;
	count: number;
	time: number;
}

export const INVARIANT_EVENT = 'laser:invariant';

const counts = new Map<string, number>();
const lastFire = new Map<string, number>();
let throttleMs = 1000;

export function setInvariantThrottle(ms: number): void {
	throttleMs = Math.max(0, ms);
}

export function invariant(cond: unknown, msg: string, ctx?: unknown): boolean {
	if (cond) return true;
	const now = Date.now();
	const count = (counts.get(msg) ?? 0) + 1;
	counts.set(msg, count);
	const prev = lastFire.get(msg) ?? -Infinity;
	if (now - prev >= throttleMs) {
		lastFire.set(msg, now);
		console.error(
			`[invariant] ${msg}${count > 1 ? ` (x${count})` : ''}`,
			ctx,
		);
		laserEvents.emit(INVARIANT_EVENT, { msg, ctx, count, time: now });
	}
	return false;
}

export function resetInvariants(): void {
	counts.clear();
	lastFire.clear();
}
