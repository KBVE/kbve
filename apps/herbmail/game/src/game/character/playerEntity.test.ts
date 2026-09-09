import { describe, it, expect, beforeEach } from 'vitest';
import { resetPropsWorld, CharState, HeldItems } from '../mecs/props';
import { equip, unequip } from '../viewmodel/store';
import {
	playerEid,
	playerBits,
	writePlayerBits,
	heldCode,
	heldId,
} from './playerEntity';
import { CS, canBlockBits } from './charState';

describe('player entity', () => {
	beforeEach(() => {
		unequip('sword');
		unequip('torch');
	});

	it('held code mapping round-trips', () => {
		expect(heldCode('sword')).toBeGreaterThan(0);
		expect(heldId(heldCode('sword'))).toBe('sword');
		expect(heldCode(null)).toBe(0);
		expect(heldId(0)).toBeNull();
	});

	it('equipping writes HeldItems codes and capability bits', () => {
		const eid = playerEid();
		expect(HeldItems.right[eid]).toBe(0);
		expect(canBlockBits(playerBits())).toBe(false);

		equip('sword');
		expect(heldId(HeldItems.right[eid])).toBe('sword');
		expect(playerBits() & CS.HAS_WEAPON).toBeTruthy();
		expect(canBlockBits(playerBits())).toBe(true);

		equip('torch');
		expect(heldId(HeldItems.left[eid])).toBe('torch');
		expect(playerBits() & CS.HAS_LIGHT).toBeTruthy();

		unequip('sword');
		expect(playerBits() & CS.HAS_WEAPON).toBeFalsy();
		expect(canBlockBits(playerBits())).toBe(false);
		expect(heldId(HeldItems.right[eid])).toBe('torch');
	});

	it('writePlayerBits clears and sets masks', () => {
		const eid = playerEid();
		writePlayerBits(0, CS.MOVING | CS.RUNNING);
		expect(CharState.bits[eid] & CS.MOVING).toBeTruthy();
		writePlayerBits(CS.RUNNING, 0);
		expect(CharState.bits[eid] & CS.RUNNING).toBeFalsy();
		expect(CharState.bits[eid] & CS.MOVING).toBeTruthy();
	});
});

void resetPropsWorld;
