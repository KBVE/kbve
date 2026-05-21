import { query, hasComponent, type World } from 'bitecs';
import type { SideMap } from '@kbve/laser';
import {
	Armor,
	AURA_KIND,
	AuraEmitter,
	AuraEmitterTag,
	BuildingState,
	BuildingTag,
	Position,
} from '../components';
import { repairRange } from '../stats';
import type { Building } from '../types';

export interface AuraTickDeps {
	world: World;
	frameBuildingEids: ArrayLike<number>;
	buildingByEid: SideMap<Building>;
}

export function tickAuraEmitters(deps: AuraTickDeps, nowMs: number): void {
	for (const eid of query(deps.world, [AuraEmitterTag, Position])) {
		if (nowMs < AuraEmitter.nextTickAtMs[eid]) continue;
		if (
			hasComponent(deps.world, eid, BuildingTag) &&
			(BuildingState.destroyed[eid] || !BuildingState.online[eid])
		) {
			AuraEmitter.nextTickAtMs[eid] = nowMs + AuraEmitter.intervalMs[eid];
			continue;
		}
		AuraEmitter.nextTickAtMs[eid] = nowMs + AuraEmitter.intervalMs[eid];
		const kind = AuraEmitter.kind[eid];
		const magnitude = AuraEmitter.magnitude[eid];
		let range = AuraEmitter.range[eid];
		if (kind === AURA_KIND.repairArmor) {
			const station = deps.buildingByEid.get(eid);
			if (station && station.kind === 'repair') {
				range = repairRange(station);
			}
			const rangeSq = range * range;
			const sx = Position.x[eid];
			const sy = Position.y[eid];
			const eids = deps.frameBuildingEids;
			for (let i = 0; i < eids.length; i++) {
				const beid = eids[i];
				if (beid === eid) continue;
				if (BuildingState.destroyed[beid]) continue;
				const max = Armor.maxArmor[beid];
				const cur = Armor.armor[beid];
				if (cur >= max) continue;
				const dx = Position.x[beid] - sx;
				const dy = Position.y[beid] - sy;
				if (dx * dx + dy * dy > rangeSq) continue;
				const room = max - cur;
				Armor.armor[beid] = cur + (magnitude < room ? magnitude : room);
			}
		}
	}
}
