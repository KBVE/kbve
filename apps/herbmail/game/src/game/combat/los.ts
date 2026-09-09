import { solidAtWorld } from '../dungeon/collision';
import type { LosBlocked } from './targeting';

const STEP = 0.75;

// Wall occlusion for target acquisition: sample the XZ segment against the
// collision grid. Coarse on purpose — arches count as open, pillars are thin
// enough that a STEP miss reads as targetable, which feels right.
export const losBlockedAt: LosBlocked = (x0, z0, x1, z1) => {
	const dx = x1 - x0;
	const dz = z1 - z0;
	const dist = Math.hypot(dx, dz);
	const steps = Math.ceil(dist / STEP);
	for (let i = 1; i < steps; i++) {
		const t = i / steps;
		if (solidAtWorld(x0 + dx * t, z0 + dz * t)) return true;
	}
	return false;
};
