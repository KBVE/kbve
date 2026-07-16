import { Health, Stone, Transform3 } from '../mecs/props';
import { breakCrate } from '../dungeon/store';
import { getSimBridge } from '../sab/simBridge';
import { addLoot } from '../inventory/store';
import { hash01 } from '../geometry/rng';

export function mineHit(eid: number): void {
	const px = Transform3.px[eid];
	const py = Transform3.py[eid];
	const pz = Transform3.pz[eid];
	Health.hp[eid] = Math.max(0, Health.hp[eid] - 1);
	getSimBridge().shatter(px, py, pz);
	if (Health.hp[eid] <= 0) {
		const gemChance = Stone.ore[eid] > 0 ? 0.6 : 0.15;

		const roll = hash01(Stone.seed[eid], 7, 0x10a7);
		addLoot(roll < gemChance ? 'gem' : 'stone');
		breakCrate(eid);
	}
}
