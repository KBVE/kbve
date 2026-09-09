import * as THREE from 'three';
import { Health } from '../mecs/props';

// Mined stones shrink in discrete stages as their Health drops, so a swing reads
// as chipping the rock down. Full at hp 3, then 0.9 / 0.75 as it wears; it never
// reaches 0 here since the stone despawns on the killing hit.
export function mineStage(hp: number): number {
	if (hp >= 3) return 1;
	if (hp === 2) return 0.9;
	if (hp === 1) return 0.75;
	return 0.6;
}

// Drive one live stone's scale from its Health. Cheap: a cached userData stage
// short-circuits when nothing changed, so the shrink shows the instant hp drops.
export function applyStoneMine(eid: number, group: THREE.Object3D): void {
	const s = mineStage(Health.hp[eid]);
	if (group.userData.mineStage === s) return;
	group.userData.mineStage = s;
	group.scale.setScalar(s);
}
