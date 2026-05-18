import { ArmouryUpgradeStats } from '../components';
import { ARMOURY_UPGRADE_DEFS } from '../config';
import type { ArmouryBuilding } from '../types';

export function armouryMaxSoldiers(a: ArmouryBuilding): number {
	return (
		a.spec.maxSoldiers +
		ArmouryUpgradeStats.capacity[a.id] *
			ARMOURY_UPGRADE_DEFS.capacity.perLevel
	);
}

export function armourySoldierDamage(a: ArmouryBuilding): number {
	return (
		a.spec.soldierDamage *
		(1 +
			ArmouryUpgradeStats.damage[a.id] *
				ARMOURY_UPGRADE_DEFS.damage.perLevel)
	);
}

export function armourySoldierHp(a: ArmouryBuilding): number {
	return Math.round(
		a.spec.soldierHp *
			(1 +
				ArmouryUpgradeStats.vigor[a.id] *
					ARMOURY_UPGRADE_DEFS.vigor.perLevel),
	);
}

export function armourySpawnIntervalMs(a: ArmouryBuilding): number {
	const factor =
		1 -
		ArmouryUpgradeStats.tempo[a.id] * ARMOURY_UPGRADE_DEFS.tempo.perLevel;
	return a.spec.spawnIntervalMs * Math.max(0.2, factor);
}
