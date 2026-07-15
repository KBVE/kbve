import {
	each,
	hasComponent,
	createWorld,
	Health,
	Targetable,
	Transform3,
} from '../mecs/props';

export const ACQUIRE_RANGE = 20;
export const DROP_RANGE = 25;

const TARGET_TERMS = [Targetable, Transform3];
const world = createWorld();

// Occlusion probe: returns true when a wall blocks the segment (x0,z0)->(x1,z1).
export type LosBlocked = (
	x0: number,
	z0: number,
	x1: number,
	z1: number,
) => boolean;

let lockedEid: number | null = null;
let hardLock = false;
const listeners = new Set<() => void>();

function emit(): void {
	for (const fn of listeners) fn();
}

export function subscribeTarget(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function getTarget(): number | null {
	return lockedEid;
}

export function isHardLock(): boolean {
	return hardLock;
}

export function setHardLock(on: boolean): void {
	if (hardLock === on || (on && lockedEid === null)) return;
	hardLock = on;
	emit();
}

export function dropTarget(): void {
	if (lockedEid === null && !hardLock) return;
	lockedEid = null;
	hardLock = false;
	emit();
}

function alive(eid: number): boolean {
	return !hasComponent(world, eid, Health) || Health.hp[eid] > 0;
}

interface Candidate {
	eid: number;
	angle: number;
}

// Targetables are scarce (goblins, dummies, bosses) and cross sector borders
// while moving, so a flat world scan beats the sector-bucket index here.
function gather(
	px: number,
	pz: number,
	fx: number,
	fz: number,
	blocked: LosBlocked,
): Candidate[] {
	const out: Candidate[] = [];
	const flen = Math.hypot(fx, fz) || 1;
	const nfx = fx / flen;
	const nfz = fz / flen;
	each(world, TARGET_TERMS, (eid) => {
		if (!alive(eid)) return;
		const dx = Transform3.px[eid] - px;
		const dz = Transform3.pz[eid] - pz;
		const d = Math.hypot(dx, dz);
		if (d > ACQUIRE_RANGE || d < 1e-3) return;
		if (blocked(px, pz, Transform3.px[eid], Transform3.pz[eid])) return;
		// Unsigned angle from camera forward; signed sweep orders the cycle ring.
		const cos = (dx * nfx + dz * nfz) / d;
		const sin = (dx * nfz - dz * nfx) / d;
		out.push({ eid, angle: Math.atan2(sin, cos) });
	});
	out.sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle));
	return out;
}

// Tab: no lock -> nearest-to-forward candidate; locked -> next candidate in the
// angle-sorted ring (wraps). Returns the new target eid or null.
export function acquireOrCycle(
	px: number,
	pz: number,
	fx: number,
	fz: number,
	blocked: LosBlocked,
): number | null {
	const cands = gather(px, pz, fx, fz, blocked);
	if (cands.length === 0) {
		dropTarget();
		return null;
	}
	const idx = cands.findIndex((c) => c.eid === lockedEid);
	const next = idx === -1 ? cands[0] : cands[(idx + 1) % cands.length];
	if (next.eid !== lockedEid) {
		lockedEid = next.eid;
		emit();
	}
	return lockedEid;
}

// Per-frame validity: drop when the target died, despawned, or ran past
// DROP_RANGE. Cheap — only inspects the single locked entity.
export function tickTargeting(px: number, pz: number): void {
	if (lockedEid === null) return;
	const eid = lockedEid;
	if (
		!hasComponent(world, eid, Targetable) ||
		!alive(eid) ||
		Math.hypot(Transform3.px[eid] - px, Transform3.pz[eid] - pz) >
			DROP_RANGE
	) {
		dropTarget();
	}
}
