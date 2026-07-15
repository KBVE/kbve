import { useEffect } from 'react';
import { Collider, Health, Prop, query, Transform3 } from '../mecs/props';
import { getDungeon } from '../dungeon/store';
import { PROP_STONE } from '../prop/kinds';
import { registerInteract } from '../interact/registry';
import { onPropContact } from './melee';
import { mineHit } from './mine';

const MELEE_REACH = 1.2;

export function useStoneMine(): void {
	useEffect(() => {
		const off = onPropContact(PROP_STONE, (eid) => mineHit(eid));

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
