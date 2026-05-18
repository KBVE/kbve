import type {
	ArmouryBuilding,
	BatteryBuilding,
	Building,
	GeneratorBuilding,
	RepairBuilding,
	TowerBuilding,
} from '../types';

export interface PowerResult {
	supply: number;
	demand: number;
	batteryCharge: number;
	batteryCapacity: number;
}

export type PowerConsumer = TowerBuilding | RepairBuilding | ArmouryBuilding;

export function isPowerConsumer(b: Building): b is PowerConsumer {
	return b.kind === 'tower' || b.kind === 'repair' || b.kind === 'armoury';
}

const CHARGE_RATE = 6;

export function computeAndApplyPower(
	generators: GeneratorBuilding[],
	consumers: PowerConsumer[],
	batteries: BatteryBuilding[],
	dt: number,
): PowerResult {
	let supply = 0;
	let demand = 0;
	let batteryCharge = 0;
	let batteryCapacity = 0;

	for (let i = 0; i < generators.length; i++) {
		const g = generators[i];
		if (g.destroyed) continue;
		supply += g.spec.power;
		g.online = true;
	}

	for (let i = 0; i < consumers.length; i++) {
		const c = consumers[i];
		if (c.destroyed) continue;
		demand += c.spec.power;
	}

	for (let i = 0; i < batteries.length; i++) {
		const bat = batteries[i];
		if (bat.destroyed) continue;
		batteryCharge += bat.charge;
		batteryCapacity += bat.capacity;
	}

	const net = supply - demand;

	if (net >= 0) {
		for (let i = 0; i < consumers.length; i++) {
			const c = consumers[i];
			if (c.destroyed) continue;
			c.online = true;
		}
		let surplus = net * dt * CHARGE_RATE;
		for (let i = 0; i < batteries.length; i++) {
			if (surplus <= 0) break;
			const bat = batteries[i];
			if (bat.destroyed) continue;
			const room = bat.capacity - bat.charge;
			if (room <= 0) continue;
			const add = room < surplus ? room : surplus;
			bat.charge += add;
			batteryCharge += add;
			surplus -= add;
		}
	} else {
		let uncoveredDeficit = -net * dt;
		for (let i = 0; i < batteries.length; i++) {
			if (uncoveredDeficit <= 0) break;
			const bat = batteries[i];
			if (bat.destroyed || bat.charge <= 0) continue;
			const take =
				bat.charge < uncoveredDeficit ? bat.charge : uncoveredDeficit;
			bat.charge -= take;
			batteryCharge -= take;
			uncoveredDeficit -= take;
		}
		const batteryCoveredThisTick = uncoveredDeficit <= 0;
		let remaining = batteryCoveredThisTick ? demand : supply;
		for (let i = 0; i < consumers.length; i++) {
			const c = consumers[i];
			if (c.destroyed) continue;
			const cost = c.spec.power;
			if (remaining >= cost) {
				c.online = true;
				remaining -= cost;
			} else {
				c.online = false;
			}
		}
	}

	return {
		supply,
		demand,
		batteryCharge,
		batteryCapacity,
	};
}
