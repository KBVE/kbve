import { useEffect } from 'react';
import { Health, Prop, query, Transform3 } from '../mecs/props';
import { getDungeon } from '../dungeon/store';
import { PROP_STONE } from '../prop/kinds';
import { registerInteract } from '../interact/registry';
import { onContact } from './melee';
import { mineHit } from './mine';

// How close the player stands to mine with [F]. A touch beyond a stone's footprint
// so it's reachable without clipping in.
const STONE_REACH = 8;

// Stone mining has two triggers sharing mineHit(): a melee swing contact (quick)
// and the [F] interaction on the nearest stone (deliberate). Also registers the
// prompt provider that surfaces the closest live stone within reach.
export function useStoneMine(): void {
	useEffect(() => {
		const off = onContact((c) => {
			if (c.kind !== 'target' || !c.object) return;
			const eid = (c.object as { userData: { eid?: number } }).userData
				.eid;
			if (eid === undefined || Prop.kind[eid] !== PROP_STONE) return;
			mineHit(eid);
		});

		const unregister = registerInteract((px, pz) => {
			const world = getDungeon().world;
			let best = -1;
			let bestD = STONE_REACH * STONE_REACH;
			for (const eid of query(world, [Prop, Transform3, Health])) {
				if (Prop.kind[eid] !== PROP_STONE || Health.hp[eid] <= 0)
					continue;
				const dx = Transform3.px[eid] - px;
				const dz = Transform3.pz[eid] - pz;
				const dd = dx * dx + dz * dz;
				if (dd < bestD) {
					bestD = dd;
					best = eid;
				}
			}
			if (best < 0) return null;
			const eid = best;
			return {
				target: {
					id: `stone:${eid}`,
					verb: 'mine the rock',
					interact: () => mineHit(eid),
				},
				dist2: bestD,
			};
		});

		return () => {
			off();
			unregister();
		};
	}, []);
}
