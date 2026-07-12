import { useEffect } from 'react';
import { Health, Transform3 } from '../mecs/props';
import { breakCrate } from '../dungeon/store';
import { getDebrisPool } from '../render/DebrisPool';
import { getSimBridge } from '../sab/simBridge';
import { PROP_CRATE } from '../prop/kinds';
import { onPropContact } from './melee';

const HIT_PUFF = 3;

// Multi-hit crate damage: a melee contact on a crate takes 1 hp and puffs a few
// shards, breaking (full burst) at 0. The crack decal follows Health via
// syncCrateDamage — nothing to drive here.
export function useCrateBreak(): void {
	useEffect(
		() =>
			onPropContact(PROP_CRATE, (eid) => {
				const pos: [number, number, number] = [
					Transform3.px[eid],
					Transform3.py[eid],
					Transform3.pz[eid],
				];
				Health.hp[eid] -= 1;
				if (Health.hp[eid] <= 0) {
					getDebrisPool().burst(pos);
					getSimBridge().shatter(pos[0], pos[1], pos[2]);
					breakCrate(eid);
				} else {
					getDebrisPool().burst(pos, HIT_PUFF);
				}
			}),
		[],
	);
}
