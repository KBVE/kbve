import type { BatteryBuilding, Building } from './types';

export interface PowerResult {
	supply: number;
	demand: number;
	batteryCharge: number;
	batteryCapacity: number;
}

export function computeAndApplyPower(
	buildings: Building[],
	dt: number,
): PowerResult {
	let supply = 0;
	let demand = 0;
	const batteries: BatteryBuilding[] = [];
	const consumers: Array<
		Building & { online: boolean; spec: { power: number } }
	> = [];

	for (const b of buildings) {
		if (b.destroyed) continue;
		if (b.kind === 'generator') {
			supply += b.spec.power;
			b.online = true;
		} else if (b.kind === 'tower') {
			demand += b.spec.power;
			consumers.push(
				b as Building & { online: boolean; spec: { power: number } },
			);
		} else if (b.kind === 'repair') {
			demand += b.spec.power;
			consumers.push(
				b as Building & { online: boolean; spec: { power: number } },
			);
		} else if (b.kind === 'armoury') {
			demand += b.spec.power;
			consumers.push(
				b as Building & { online: boolean; spec: { power: number } },
			);
		} else if (b.kind === 'battery') {
			batteries.push(b);
		}
	}

	consumers.sort((a, b) => a.id - b.id);

	const net = supply - demand;
	const chargeRate = 6;
	if (net >= 0) {
		for (const c of consumers) c.online = true;
		let surplus = net * dt * chargeRate;
		for (const bat of batteries) {
			if (surplus <= 0) break;
			const room = bat.capacity - bat.charge;
			const add = Math.min(room, surplus);
			bat.charge += add;
			surplus -= add;
		}
	} else {
		const deficit = -net;
		let drainBudget = deficit * dt;
		for (const bat of batteries) {
			if (drainBudget <= 0) break;
			const take = Math.min(bat.charge, drainBudget);
			bat.charge -= take;
			drainBudget -= take;
		}
		const totalCharge = batteries.reduce((s, b) => s + b.charge, 0);
		const effectiveSupply = totalCharge > 0 ? supply + deficit : supply;
		let remaining = effectiveSupply;
		for (const c of consumers) {
			const cost = c.spec.power;
			if (remaining >= cost) {
				c.online = true;
				remaining -= cost;
			} else {
				c.online = false;
			}
		}
	}

	const totalCharge = batteries.reduce((s, b) => s + b.charge, 0);
	const totalCapacity = batteries.reduce((s, b) => s + b.capacity, 0);

	return {
		supply,
		demand,
		batteryCharge: totalCharge,
		batteryCapacity: totalCapacity,
	};
}
