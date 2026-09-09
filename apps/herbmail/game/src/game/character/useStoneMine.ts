import { useEffect } from 'react';
import { registerInteract } from '../interact/registry';
import { actionForStone, mineRefusal, nearestStone, stoneDist2 } from './mine';
import { isMining, startMine } from './mineChannel';

export function useStoneMine(): void {
	useEffect(() => {
		const unregister = registerInteract((px, pz) => {
			const eid = nearestStone(px, pz);
			if (eid < 0) return null;
			const action = actionForStone(eid);
			const refusal = mineRefusal(eid);
			const verb =
				refusal === 'tool'
					? 'need a pickaxe'
					: refusal === 'level'
						? `need mining ${action?.requiredLevel}`
						: (action?.name.toLowerCase() ?? 'mine the rock');
			return {
				target: {
					id: `stone:${eid}`,
					verb,
					interact: () => {
						if (isMining()) return;
						startMine(eid, performance.now(), px, pz);
					},
				},
				dist2: stoneDist2(eid, px, pz),
			};
		});

		return unregister;
	}, []);
}
