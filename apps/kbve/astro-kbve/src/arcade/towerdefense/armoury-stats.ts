import { ARMOURY_UPGRADE_DEFS } from './config';
import type { ArmouryBuilding } from './types';

export function armouryMaxSoldiers(a: ArmouryBuilding): number {
	return (
		a.spec.maxSoldiers +
		a.upgrades.capacity * ARMOURY_UPGRADE_DEFS.capacity.perLevel
	);
}

export function armourySoldierDamage(a: ArmouryBuilding): number {
	return (
		a.spec.soldierDamage *
		(1 + a.upgrades.damage * ARMOURY_UPGRADE_DEFS.damage.perLevel)
	);
}

export function armourySoldierHp(a: ArmouryBuilding): number {
	return Math.round(
		a.spec.soldierHp *
			(1 + a.upgrades.vigor * ARMOURY_UPGRADE_DEFS.vigor.perLevel),
	);
}

export function armourySpawnIntervalMs(a: ArmouryBuilding): number {
	const factor = 1 - a.upgrades.tempo * ARMOURY_UPGRADE_DEFS.tempo.perLevel;
	return a.spec.spawnIntervalMs * Math.max(0.2, factor);
}
