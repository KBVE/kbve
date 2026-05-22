import { describe, expect, it, beforeEach } from 'vitest';
import { BatteryState, BuildingState } from '../components';
import { consumeBatteryCharge } from './battery';

function setupBatteries(charges: number[]): number[] {
	const eids: number[] = [];
	for (let i = 0; i < charges.length; i++) {
		const eid = 100 + i;
		BuildingState.destroyed[eid] = 0;
		BatteryState.charge[eid] = charges[i];
		BatteryState.capacity[eid] = 50;
		eids.push(eid);
	}
	return eids;
}

describe('consumeBatteryCharge', () => {
	beforeEach(() => {
		for (let i = 100; i < 200; i++) {
			BuildingState.destroyed[i] = 0;
			BatteryState.charge[i] = 0;
		}
	});

	it('returns false when total charge is below request', () => {
		const eids = setupBatteries([5, 3]);
		expect(consumeBatteryCharge(eids, 20)).toBe(false);
		// must NOT drain on partial failure
		expect(BatteryState.charge[eids[0]]).toBe(5);
		expect(BatteryState.charge[eids[1]]).toBe(3);
	});

	it('drains across batteries when total is sufficient', () => {
		const eids = setupBatteries([10, 10, 10]);
		expect(consumeBatteryCharge(eids, 25)).toBe(true);
		const total =
			BatteryState.charge[eids[0]] +
			BatteryState.charge[eids[1]] +
			BatteryState.charge[eids[2]];
		expect(total).toBe(5);
	});

	it('skips destroyed batteries', () => {
		const eids = setupBatteries([10, 10]);
		BuildingState.destroyed[eids[0]] = 1;
		expect(consumeBatteryCharge(eids, 12)).toBe(false);
	});
});
