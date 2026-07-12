import { useEffect } from 'react';
import { Collider, Health, Prop, query, Transform3 } from '../mecs/props';
import { getDungeon } from '../dungeon/store';
import { PROP_STONE } from '../prop/kinds';
import { registerInteract } from '../interact/registry';
import { onContact } from './melee';
import { mineHit } from './mine';

// Striking distance from the player to a stone's SURFACE for the [F] prompt — a
// swing's forward arm reach. Per-stone the gate is MELEE_REACH + the stone's
// collider radius, so a bigger rock is mineable from proportionally farther.
const MELEE_REACH = 1.2;

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
			let bestD = Infinity;
			for (const eid of query(world, [Prop, Transform3, Health])) {
				if (Prop.kind[eid] !== PROP_STONE || Health.hp[eid] <= 0)
					continue;
				const dx = Transform3.px[eid] - px;
				const dz = Transform3.pz[eid] - pz;
				const dd = dx * dx + dz * dz;
				const reach = MELEE_REACH + Collider.hx[eid];
				if (dd <= reach * reach && dd < bestD) {
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
