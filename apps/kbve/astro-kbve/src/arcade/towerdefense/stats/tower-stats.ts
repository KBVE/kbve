import { TowerUpgradeStats } from '../components';
import { UPGRADE_DEFS } from '../config';
import type { TowerBuilding } from '../types';

export function towerRange(t: TowerBuilding): number {
	return (
		t.spec.range *
		(1 + TowerUpgradeStats.radar[t.id] * UPGRADE_DEFS.radar.perLevel)
	);
}

export function towerDamage(t: TowerBuilding): number {
	return (
		t.spec.damage *
		(1 + TowerUpgradeStats.attack[t.id] * UPGRADE_DEFS.attack.perLevel)
	);
}

export function towerBurnDps(t: TowerBuilding): number {
	return (
		t.spec.burnDps *
		(1 + TowerUpgradeStats.attack[t.id] * UPGRADE_DEFS.attack.perLevel)
	);
}

export function towerFireRateMs(t: TowerBuilding): number {
	const factor =
		1 - TowerUpgradeStats.speed[t.id] * UPGRADE_DEFS.speed.perLevel;
	return t.spec.fireRateMs * Math.max(0.1, factor);
}

export function towerMaxHp(t: TowerBuilding): number {
	return Math.round(
		t.spec.maxHp *
			(1 + TowerUpgradeStats.armor[t.id] * UPGRADE_DEFS.armor.perLevel),
	);
}
