import { describe, expect, it, beforeEach } from 'vitest';
import { addComponent, addEntity, createWorld, type World } from 'bitecs';
import {
	BatteryState,
	BatteryTag,
	BuildingTag,
	BuildingState,
	Health,
} from '../components';
import { boostBatteries, healAllBuildings, type CardCtx } from './handlers';

function makeCtx(world: World): CardCtx {
	return {
		world,
		buildingByEid: null as never,
		spawnArmourySoldier: () => {},
		redrawUpgradePips: () => {},
	};
}

function addBattery(world: World, charge: number, capacity: number): number {
	const eid = addEntity(world);
	addComponent(world, eid, BuildingTag);
	addComponent(world, eid, BatteryTag);
	BatteryState.charge[eid] = charge;
	BatteryState.capacity[eid] = capacity;
	BuildingState.destroyed[eid] = 0;
	return eid;
}

function addBuilding(world: World, hp: number, maxHp: number): number {
	const eid = addEntity(world);
	addComponent(world, eid, BuildingTag);
	Health.hp[eid] = hp;
	Health.maxHp[eid] = maxHp;
	BuildingState.destroyed[eid] = 0;
	return eid;
}

describe('cards/handlers', () => {
	let world: World;
	beforeEach(() => {
		world = createWorld();
	});

	it('boostBatteries fills up to capacity across batteries', () => {
		const a = addBattery(world, 5, 20);
		const b = addBattery(world, 0, 10);
		boostBatteries(makeCtx(world), 25);
		const total = BatteryState.charge[a] + BatteryState.charge[b];
		// 5 starting + 25 added
		expect(total).toBe(30);
	});

	it('boostBatteries skips destroyed batteries', () => {
		const a = addBattery(world, 0, 20);
		const b = addBattery(world, 0, 20);
		BuildingState.destroyed[a] = 1;
		boostBatteries(makeCtx(world), 10);
		expect(BatteryState.charge[a]).toBe(0);
		expect(BatteryState.charge[b]).toBe(10);
	});

	it('healAllBuildings tops up hp ignoring destroyed entities', () => {
		const alive = addBuilding(world, 30, 200);
		const dead = addBuilding(world, 5, 200);
		BuildingState.destroyed[dead] = 1;
		healAllBuildings(makeCtx(world));
		expect(Health.hp[alive]).toBe(200);
		expect(Health.hp[dead]).toBe(5);
	});
});
