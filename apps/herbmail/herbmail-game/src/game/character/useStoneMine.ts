import { useEffect } from 'react';
import { Health, Prop, Transform3 } from '@kbve/laser/ecs';
import { breakCrate } from '../dungeon/store';
import { getSimBridge } from '../sab/simBridge';
import { PROP_STONE } from '../prop/kinds';
import { onContact } from './melee';

// Multi-hit stone mining: a melee contact on a hitbox object resolves its prop
// eid; a stone takes 1 hp and chips debris, shrinking a stage each hit (driven by
// syncStoneMine) and despawning at 0. Shares the crate despawn helper so a mined
// stone is suppressed and won't respawn on room streaming.
export function useStoneMine(): void {
	useEffect(
		() =>
			onContact((c) => {
				if (c.kind !== 'target' || !c.object) return;
				const eid = (c.object as { userData: { eid?: number } })
					.userData.eid;
				if (eid === undefined || Prop.kind[eid] !== PROP_STONE) return;

				const px = Transform3.px[eid];
				const py = Transform3.py[eid];
				const pz = Transform3.pz[eid];

				Health.hp[eid] = Math.max(0, Health.hp[eid] - 1);
				getSimBridge().shatter(px, py, pz);

				if (Health.hp[eid] <= 0) {
					// TODO: spawn ore drop (Stone.ore[eid])
					breakCrate(eid);
				}
			}),
		[],
	);
}
