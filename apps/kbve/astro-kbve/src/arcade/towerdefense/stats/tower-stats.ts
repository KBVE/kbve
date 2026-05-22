import { TowerUpgradeStats } from '../components';
import { UPGRADE_DEFS } from '../config';
import type { TowerBuilding } from '../types';

const TIER_RANGE_MUL = 0.25;
const TIER_DAMAGE_MUL = 0.5;
const TIER_HP_MUL = 0.5;
const TIER_FIRERATE_MUL = 0.1;

export function towerTier(t: TowerBuilding): number {
	return TowerUpgradeStats.tier[t.id];
}

export function towerTierCost(t: TowerBuilding): number {
	const next = TowerUpgradeStats.tier[t.id] + 1;
	return Math.floor(t.spec.cost * (1 + next * 1.5));
}

export function towerRange(t: TowerBuilding): number {
	const tier = TowerUpgradeStats.tier[t.id];
	return (
		t.spec.range *
		(1 + TowerUpgradeStats.radar[t.id] * UPGRADE_DEFS.radar.perLevel) *
		(1 + tier * TIER_RANGE_MUL)
	);
}

export function towerDamage(t: TowerBuilding): number {
	const tier = TowerUpgradeStats.tier[t.id];
	return (
		t.spec.damage *
		(1 + TowerUpgradeStats.attack[t.id] * UPGRADE_DEFS.attack.perLevel) *
		(1 + tier * TIER_DAMAGE_MUL)
	);
}

export function towerBurnDps(t: TowerBuilding): number {
	const tier = TowerUpgradeStats.tier[t.id];
	return (
		t.spec.burnDps *
		(1 + TowerUpgradeStats.attack[t.id] * UPGRADE_DEFS.attack.perLevel) *
		(1 + tier * TIER_DAMAGE_MUL)
	);
}

export function towerFireRateMs(t: TowerBuilding): number {
	const tier = TowerUpgradeStats.tier[t.id];
	const factor =
		1 -
		TowerUpgradeStats.speed[t.id] * UPGRADE_DEFS.speed.perLevel -
		tier * TIER_FIRERATE_MUL;
	return t.spec.fireRateMs * Math.max(0.1, factor);
}

export function towerMaxHp(t: TowerBuilding): number {
	const tier = TowerUpgradeStats.tier[t.id];
	return Math.round(
		t.spec.maxHp *
			(1 + TowerUpgradeStats.armor[t.id] * UPGRADE_DEFS.armor.perLevel) *
			(1 + tier * TIER_HP_MUL),
	);
}

export function towerSplashRadius(t: TowerBuilding): number {
	const base = t.spec.splashRadius;
	if (base <= 0) return 0;
	if (t.spec.id === 'artillery') {
		return base * (1 + TowerUpgradeStats.radar[t.id] * 0.3);
	}
	return base;
}
