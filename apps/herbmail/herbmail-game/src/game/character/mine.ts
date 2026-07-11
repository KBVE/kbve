import { Health, Transform3 } from '../mecs/props';
import { breakCrate } from '../dungeon/store';
import { getSimBridge } from '../sab/simBridge';

// One mining strike on a stone entity: drop 1 hp, chip physics debris in the SAB
// sim, and on depletion despawn + suppress via the shared prop-break helper (so it
// stays mined out across streaming). Called from both the melee swing (quick) and
// the [F] interaction (deliberate). Scale-down per stage is driven by syncStoneMine.
export function mineHit(eid: number): void {
	const px = Transform3.px[eid];
	const py = Transform3.py[eid];
	const pz = Transform3.pz[eid];
	Health.hp[eid] = Math.max(0, Health.hp[eid] - 1);
	getSimBridge().shatter(px, py, pz);
	if (Health.hp[eid] <= 0) {
		// TODO: spawn ore drop (Stone.ore[eid])
		breakCrate(eid);
	}
}
