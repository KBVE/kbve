import * as THREE from 'three';
import { Health, Prop } from '../mecs/props';
import { PROP_STONE } from '../prop/kinds';

// Mined stones shrink in discrete stages as their Health drops, so a swing reads
// as chipping the rock down. Full at hp 3, then 0.9 / 0.75 as it wears; it never
// reaches 0 here since the stone despawns on the killing hit.
export function mineStage(hp: number): number {
	if (hp >= 3) return 1;
	if (hp === 2) return 0.9;
	if (hp === 1) return 0.75;
	return 0.6;
}

// Drive each live stone's scale from its Health every frame. Cheap: a cached
// userData stage short-circuits when nothing changed, so the shrink shows the
// instant hp drops without a reconcile.
export function syncStoneMine(
	entries: Iterable<[number, THREE.Object3D]>,
): void {
	for (const [eid, group] of entries) {
		if (Prop.kind[eid] !== PROP_STONE) continue;
		const s = mineStage(Health.hp[eid]);
		if (group.userData.mineStage === s) continue;
		group.userData.mineStage = s;
		group.scale.setScalar(s);
	}
}
