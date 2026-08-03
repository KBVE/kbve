import { Health, Prop } from '../mecs/props';
import { PROP_STONE } from '../prop/kinds';
import { actionForStone, mineHit, mineRefusal } from './mine';

// Mining is a channel, not an instant hit: the swing loops for the action's
// professiondb durationMs and only yields on completion. Moving cancels it.
// Progress is wall-clock so a frame hitch cannot skip the payout.
const CANCEL_DIST = 0.6;
// Floor on the channel so the looping swing always gets time to read as a swing
// before the yield lands, however short a durationMs the DB hands us.
const MIN_MS = 1500;

interface Channel {
	eid: number;
	startMs: number;
	endMs: number;
	x: number;
	z: number;
}

let active: Channel | null = null;
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function subscribeMine(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function isMining(): boolean {
	return active !== null;
}

export function minedEid(): number {
	return active?.eid ?? -1;
}

/** 0..1 through the current channel, or 0 when idle. */
export function mineProgress(nowMs: number): number {
	if (!active) return 0;
	const span = active.endMs - active.startMs;
	if (span <= 0) return 1;
	return Math.min(1, Math.max(0, (nowMs - active.startMs) / span));
}

export function startMine(
	eid: number,
	nowMs: number,
	x: number,
	z: number,
): boolean {
	if (active) return false;
	const action = actionForStone(eid);
	if (!action || mineRefusal(eid) !== null) return false;
	const ms = Math.max(MIN_MS, action.durationMs ?? MIN_MS);
	active = { eid, startMs: nowMs, endMs: nowMs + ms, x, z };
	emit();
	return true;
}

export function cancelMine(): void {
	if (!active) return;
	active = null;
	emit();
}

/** Advances the channel: pays out on completion, cancels if the player walked
 * off or the rock stopped being minable. */
export function tickMine(nowMs: number, x: number, z: number): void {
	if (!active) return;
	const { eid } = active;

	const gone =
		Prop.kind[eid] !== PROP_STONE ||
		Health.hp[eid] <= 0 ||
		mineRefusal(eid) !== null;
	const moved = Math.hypot(x - active.x, z - active.z) > CANCEL_DIST;
	if (gone || moved) {
		cancelMine();
		return;
	}

	if (nowMs < active.endMs) return;
	active = null;
	mineHit(eid);
	emit();
}
