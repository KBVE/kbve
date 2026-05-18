import { REPAIR_UPGRADE_DEFS } from '../config';
import type { RepairBuilding } from '../types';

export function repairRange(b: RepairBuilding): number {
	return (
		b.spec.repairRange *
		(1 + b.upgrades.reach * REPAIR_UPGRADE_DEFS.reach.perLevel)
	);
}

export function repairAmount(b: RepairBuilding): number {
	return Math.round(
		b.spec.repairAmount *
			(1 + b.upgrades.yield * REPAIR_UPGRADE_DEFS.yield.perLevel),
	);
}

export function repairCooldownMs(b: RepairBuilding): number {
	const factor = 1 - b.upgrades.tempo * REPAIR_UPGRADE_DEFS.tempo.perLevel;
	return b.spec.cooldownMs * Math.max(0.2, factor);
}
