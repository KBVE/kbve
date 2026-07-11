import { useEffect } from 'react';
import { Health, Prop, Transform3 } from '@kbve/laser/ecs';
import { breakCrate } from '../dungeon/store';
import { getDebrisPool } from '../render/DebrisPool';
import { getSimBridge } from '../sab/simBridge';
import { PROP_CRATE } from '../prop/kinds';
import { onContact } from './melee';

const HIT_PUFF = 3;

// Multi-hit crate damage: a melee contact on a hitbox object resolves its prop
// eid; a crate takes 1 hp and puffs a few shards, breaking (full burst) at 0. The
// crack decal follows Health via syncCrateDamage — nothing to drive here.
export function useCrateBreak(): void {
	useEffect(
		() =>
			onContact((c) => {
				if (c.kind !== 'target' || !c.object) return;
				const eid = (c.object as { userData: { eid?: number } })
					.userData.eid;
				if (eid === undefined || Prop.kind[eid] !== PROP_CRATE) return;

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
