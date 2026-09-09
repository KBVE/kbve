import { describe, it, expect, beforeEach } from 'vitest';
import * as P from '../mecs/props';
import { spawnPropBase } from '../prop/base';
import {
	acquireOrCycle,
	getTarget,
	dropTarget,
	setHardLock,
	isHardLock,
	tickTargeting,
	ACQUIRE_RANGE,
	DROP_RANGE,
} from './targeting';

const SECTOR_EID = 7;
const DIR: [number, number, number] = [0, 1, 0];

function spawnTarget(x: number, z: number, hp = 10): number {
	const w = P.createWorld();
	const eid = spawnPropBase(w, 0, SECTOR_EID, [x, 1, z], DIR);
	P.addComponent(w, eid, P.Targetable);
	P.Targetable.radius[eid] = 0.5;
	P.addComponent(w, eid, P.Health);
	P.Health.hp[eid] = hp;
	P.Health.maxHp[eid] = hp;
	return eid;
}

const CAM = { x: 0, z: 0, fx: 0, fz: 1 };
const NO_WALLS = () => false;

function acquire(): number | null {
	return acquireOrCycle(CAM.x, CAM.z, CAM.fx, CAM.fz, NO_WALLS);
}

describe('tab targeting', () => {
	beforeEach(() => {
		P.resetPropsWorld();
		dropTarget();
	});

	it('acquires the candidate nearest the camera forward axis', () => {
		spawnTarget(4, 5);
		const front = spawnTarget(0.5, 6);
		expect(acquire()).toBe(front);
		expect(getTarget()).toBe(front);
	});

	it('cycles through candidates and wraps', () => {
		const a = spawnTarget(0, 5);
		const b = spawnTarget(3, 5);
		const c = spawnTarget(-3, 5);
		const first = acquire();
		expect(first).toBe(a);
		const order = [acquire(), acquire(), acquire()];
		expect(new Set([...order, first]).size).toBe(3);
		expect(order).toContain(b);
		expect(order).toContain(c);
		expect(order[2]).toBe(a);
	});

	it('ignores candidates beyond acquire range', () => {
		spawnTarget(0, ACQUIRE_RANGE + 5);
		expect(acquire()).toBeNull();
	});

	it('ignores dead and wall-occluded candidates', () => {
		spawnTarget(0, 5, 0);
		expect(acquire()).toBeNull();
		const blocked = spawnTarget(0, 8);
		expect(
			acquireOrCycle(CAM.x, CAM.z, CAM.fx, CAM.fz, () => true),
		).toBeNull();
		expect(blocked).toBeGreaterThan(0);
	});

	it('tick drops lock when the target dies or leaves drop range', () => {
		const a = spawnTarget(0, 5);
		acquire();
		P.Health.hp[a] = 0;
		tickTargeting(CAM.x, CAM.z);
		expect(getTarget()).toBeNull();

		const b = spawnTarget(0, 6);
		acquire();
		P.Transform3.pz[b] = DROP_RANGE + 2;
		tickTargeting(CAM.x, CAM.z);
		expect(getTarget()).toBeNull();
	});

	it('hard lock flag follows setHardLock and clears on drop', () => {
		spawnTarget(0, 5);
		acquire();
		setHardLock(true);
		expect(isHardLock()).toBe(true);
		dropTarget();
		expect(isHardLock()).toBe(false);
	});
});
