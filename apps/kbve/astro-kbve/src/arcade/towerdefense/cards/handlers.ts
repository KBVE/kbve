import { query, type World } from 'bitecs';
import type { SideMap } from '@kbve/laser';
import {
	ArmouryTag,
	ArmouryUpgradeStats,
	BatteryState,
	BatteryTag,
	BuildingState,
	BuildingTag,
	Health,
	RepairUpgradeStats,
	TowerUpgradeStats,
} from '../components';
import {
	ARMOURY_UPGRADE_DEFS,
	ARMOURY_UPGRADE_ORDER,
	REPAIR_UPGRADE_DEFS,
	REPAIR_UPGRADE_ORDER,
	UPGRADE_DEFS,
	UPGRADE_ORDER,
} from '../config';
import { towerMaxHp } from '../stats';
import type { ArmouryBuilding, Building, TowerBuilding } from '../types';

export interface CardCtx {
	world: World;
	buildingByEid: SideMap<Building>;
	spawnArmourySoldier: (b: ArmouryBuilding) => void;
	redrawUpgradePips: (b: TowerBuilding) => void;
}

export function summonSoldierSquad(ctx: CardCtx, count: number): boolean {
	const alive: ArmouryBuilding[] = [];
	for (const eid of query(ctx.world, [ArmouryTag])) {
		if (BuildingState.destroyed[eid]) continue;
		const b = ctx.buildingByEid.get(eid);
		if (b && b.kind === 'armoury') alive.push(b);
	}
	if (alive.length === 0) return false;
	for (let i = 0; i < count; i++) {
		ctx.spawnArmourySoldier(alive[i % alive.length]);
	}
	return true;
}

export function healAllBuildings(ctx: CardCtx): void {
	for (const eid of query(ctx.world, [BuildingTag])) {
		if (BuildingState.destroyed[eid]) continue;
		Health.hp[eid] = Health.maxHp[eid];
	}
}

export function boostBatteries(ctx: CardCtx, amount: number): void {
	let left = amount;
	for (const eid of query(ctx.world, [BatteryTag])) {
		if (BuildingState.destroyed[eid]) continue;
		const room = BatteryState.capacity[eid] - BatteryState.charge[eid];
		const add = Math.min(room, left);
		BatteryState.charge[eid] += add;
		left -= add;
		if (left <= 0) break;
	}
}

export function applyRandomUpgradeTo(ctx: CardCtx, b: Building): boolean {
	const apply: Array<() => void> = [];
	if (b.kind === 'tower') {
		const tower = b;
		for (const k of UPGRADE_ORDER) {
			if (TowerUpgradeStats[k][tower.id] >= UPGRADE_DEFS[k].maxLevel)
				continue;
			apply.push(() => {
				const prevMaxHp = towerMaxHp(tower);
				TowerUpgradeStats[k][tower.id] += 1;
				const newMaxHp = towerMaxHp(tower);
				Health.maxHp[tower.id] = newMaxHp;
				if (k === 'armor') {
					const delta = newMaxHp - prevMaxHp;
					Health.hp[tower.id] = Math.min(
						newMaxHp,
						Health.hp[tower.id] + delta,
					);
				}
				ctx.redrawUpgradePips(tower);
			});
		}
	} else if (b.kind === 'armoury') {
		const armoury = b;
		for (const k of ARMOURY_UPGRADE_ORDER) {
			if (
				ArmouryUpgradeStats[k][armoury.id] >=
				ARMOURY_UPGRADE_DEFS[k].maxLevel
			)
				continue;
			apply.push(() => {
				ArmouryUpgradeStats[k][armoury.id] += 1;
			});
		}
	} else if (b.kind === 'repair') {
		const station = b;
		for (const k of REPAIR_UPGRADE_ORDER) {
			if (
				RepairUpgradeStats[k][station.id] >=
				REPAIR_UPGRADE_DEFS[k].maxLevel
			)
				continue;
			apply.push(() => {
				RepairUpgradeStats[k][station.id] += 1;
			});
		}
	}
	if (apply.length === 0) return false;
	apply[Math.floor(Math.random() * apply.length)]();
	return true;
}
