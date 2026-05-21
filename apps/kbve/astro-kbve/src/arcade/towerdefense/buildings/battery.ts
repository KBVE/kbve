import { BatteryState, BuildingState } from '../components';

export function consumeBatteryCharge(
	batteryEids: ArrayLike<number>,
	amount: number,
): boolean {
	let total = 0;
	for (let i = 0; i < batteryEids.length; i++) {
		const beid = batteryEids[i];
		if (BuildingState.destroyed[beid]) continue;
		total += BatteryState.charge[beid];
		if (total >= amount) break;
	}
	if (total < amount) return false;
	let remaining = amount;
	for (let i = 0; i < batteryEids.length; i++) {
		if (remaining <= 0) break;
		const beid = batteryEids[i];
		if (BuildingState.destroyed[beid]) continue;
		const charge = BatteryState.charge[beid];
		if (charge <= 0) continue;
		const take = charge < remaining ? charge : remaining;
		BatteryState.charge[beid] = charge - take;
		remaining -= take;
	}
	return true;
}
