import { describe, it, expect } from 'vitest';
import { CS, resolveBase, resolveOverlays, canBlockBits } from './charState';

const walkParams = {
	runBlend: 0,
	walkTs: 1,
	strafeBin: 'Fwd' as const,
	landSpeed: 1.35,
	loco: { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop' },
};

describe('resolveBase priority', () => {
	it('dead wins over everything', () => {
		const r = resolveBase(CS.DEAD | CS.AIRBORNE | CS.MOVING, walkParams);
		expect(r).toEqual({ kind: 'play', clip: 'Death01', loop: false });
	});

	it('airborne rising -> Jump_Start, falling -> Jump_Loop', () => {
		expect(resolveBase(CS.AIRBORNE | CS.RISING, walkParams)).toMatchObject({
			clip: 'Jump_Start',
		});
		expect(resolveBase(CS.AIRBORNE, walkParams)).toMatchObject({
			clip: 'Jump_Loop',
		});
	});

	it('landing plays Jump_Land one-shot', () => {
		expect(resolveBase(CS.LANDING, walkParams)).toMatchObject({
			clip: 'Jump_Land',
			loop: false,
		});
	});

	it('idle when not moving, honoring custom locomotion clips', () => {
		expect(resolveBase(0, walkParams)).toMatchObject({
			clip: 'Idle_Loop',
		});
		const goblin = {
			...walkParams,
			loco: {
				idle: 'Idle_Loop',
				walk: 'Zombie_Walk_Fwd_Loop',
				run: 'Zombie_Walk_Fwd_Loop',
			},
		};
		expect(resolveBase(CS.MOVING, goblin)).toMatchObject({
			clip: 'Zombie_Walk_Fwd_Loop',
		});
	});

	it('combat-locked movement resolves directional strafe clip by tier', () => {
		const r = resolveBase(CS.COMBAT_LOCK | CS.MOVING, {
			...walkParams,
			strafeBin: 'L',
		});
		expect(r).toMatchObject({ clip: 'Walk_L_Loop' });
		const jog = resolveBase(CS.COMBAT_LOCK | CS.MOVING, {
			...walkParams,
			runBlend: 1,
			strafeBin: 'BwdR',
		});
		expect(jog).toMatchObject({ clip: 'Jog_Bwd_R_Loop' });
	});

	it('free movement walks with timescale or blends to jog', () => {
		expect(resolveBase(CS.MOVING, { ...walkParams, walkTs: 1.4 })).toEqual({
			kind: 'play',
			clip: 'Walk_Loop',
			timeScale: 1.4,
		});
		expect(
			resolveBase(CS.MOVING | CS.RUNNING, {
				...walkParams,
				runBlend: 0.6,
			}),
		).toEqual({
			kind: 'blend',
			a: 'Walk_Loop',
			b: 'Jog_Fwd_Loop',
			alpha: 0.6,
		});
	});
});

describe('overlays', () => {
	it('blocking overlay follows the BLOCKING bit', () => {
		expect(resolveOverlays(CS.BLOCKING)).toMatchObject({ block: true });
		expect(resolveOverlays(0)).toMatchObject({ block: false });
	});
});

describe('equipment gating', () => {
	it('blocking allowed only with weapon or shield bits', () => {
		expect(canBlockBits(CS.HAS_WEAPON)).toBe(true);
		expect(canBlockBits(CS.HAS_SHIELD)).toBe(true);
		expect(canBlockBits(CS.HAS_WEAPON | CS.HAS_SHIELD)).toBe(true);
		expect(canBlockBits(0)).toBe(false);
	});
});
