import { UPGRADE_DEFS } from '../config';
import type { TowerBuilding } from '../types';

export function towerRange(t: TowerBuilding): number {
	return t.spec.range * (1 + t.upgrades.radar * UPGRADE_DEFS.radar.perLevel);
}

export function towerDamage(t: TowerBuilding): number {
	return (
		t.spec.damage * (1 + t.upgrades.attack * UPGRADE_DEFS.attack.perLevel)
	);
}

export function towerBurnDps(t: TowerBuilding): number {
	return (
		t.spec.burnDps * (1 + t.upgrades.attack * UPGRADE_DEFS.attack.perLevel)
	);
}

export function towerFireRateMs(t: TowerBuilding): number {
	const factor = 1 - t.upgrades.speed * UPGRADE_DEFS.speed.perLevel;
	return t.spec.fireRateMs * Math.max(0.1, factor);
}

export function towerMaxHp(t: TowerBuilding): number {
	return Math.round(
		t.spec.maxHp * (1 + t.upgrades.armor * UPGRADE_DEFS.armor.perLevel),
	);
}
