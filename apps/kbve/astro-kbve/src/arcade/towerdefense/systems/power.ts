import { BatteryState, BuildingState, BUILDING_KIND } from '../components';
import type { Building } from '../types';

export interface PowerResult {
	supply: number;
	demand: number;
	batteryCharge: number;
	batteryCapacity: number;
}

export function isPowerConsumerKind(kindIndex: number): boolean {
	return (
		kindIndex === BUILDING_KIND.tower ||
		kindIndex === BUILDING_KIND.repair ||
		kindIndex === BUILDING_KIND.armoury
	);
}

export function isPowerConsumer(b: Building): boolean {
	return b.kind === 'tower' || b.kind === 'repair' || b.kind === 'armoury';
}

const CHARGE_RATE = 6;

export function computeAndApplyPower(
	generatorEids: number[],
	consumerEids: number[],
	batteryEids: number[],
	dt: number,
): PowerResult {
	let supply = 0;
	let demand = 0;
	let batteryCharge = 0;
	let batteryCapacity = 0;

	for (let i = 0; i < generatorEids.length; i++) {
		const eid = generatorEids[i];
		if (BuildingState.destroyed[eid]) continue;
		supply += BuildingState.power[eid];
		BuildingState.online[eid] = 1;
	}

	for (let i = 0; i < consumerEids.length; i++) {
		const eid = consumerEids[i];
		if (BuildingState.destroyed[eid]) continue;
		demand += BuildingState.power[eid];
	}

	for (let i = 0; i < batteryEids.length; i++) {
		const eid = batteryEids[i];
		if (BuildingState.destroyed[eid]) continue;
		batteryCharge += BatteryState.charge[eid];
		batteryCapacity += BatteryState.capacity[eid];
	}

	const net = supply - demand;

	if (net >= 0) {
		for (let i = 0; i < consumerEids.length; i++) {
			const eid = consumerEids[i];
			if (BuildingState.destroyed[eid]) continue;
			BuildingState.online[eid] = 1;
		}
		let surplus = net * dt * CHARGE_RATE;
		for (let i = 0; i < batteryEids.length; i++) {
			if (surplus <= 0) break;
			const eid = batteryEids[i];
			if (BuildingState.destroyed[eid]) continue;
			const room = BatteryState.capacity[eid] - BatteryState.charge[eid];
			if (room <= 0) continue;
			const add = room < surplus ? room : surplus;
			BatteryState.charge[eid] += add;
			batteryCharge += add;
			surplus -= add;
		}
	} else {
		let uncoveredDeficit = -net * dt;
		for (let i = 0; i < batteryEids.length; i++) {
			if (uncoveredDeficit <= 0) break;
			const eid = batteryEids[i];
			if (BuildingState.destroyed[eid] || BatteryState.charge[eid] <= 0)
				continue;
			const charge = BatteryState.charge[eid];
			const take = charge < uncoveredDeficit ? charge : uncoveredDeficit;
			BatteryState.charge[eid] -= take;
			batteryCharge -= take;
			uncoveredDeficit -= take;
		}
		const batteryCoveredThisTick = uncoveredDeficit <= 0;
		let remaining = batteryCoveredThisTick ? demand : supply;
		for (let i = 0; i < consumerEids.length; i++) {
			const eid = consumerEids[i];
			if (BuildingState.destroyed[eid]) continue;
			const cost = BuildingState.power[eid];
			if (remaining >= cost) {
				BuildingState.online[eid] = 1;
				remaining -= cost;
			} else {
				BuildingState.online[eid] = 0;
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
