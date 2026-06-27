import { describe, it, expect, vi } from 'vitest';

// ship.ts pulls Phaser (WebGL, no jsdom canvas) + the asset-base helper; neither is
// needed to exercise the pure sub-decode + sheet-layout invariants below.
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../config', () => ({ arpgAsset: (p: string) => p }));

import {
	SHIP_SHEETS,
	SHIP_PHASE_TO_STATE,
	shipFacingFromSub,
	shipPhaseFromSub,
} from './ship';

describe('ship sub byte (facing | phase << 4)', () => {
	it('round-trips facing + phase, byte-identical to the server pack', () => {
		for (let facing = 0; facing < 16; facing++) {
			for (let phase = 0; phase < 6; phase++) {
				const sub = (facing & 0x0f) | (phase << 4);
				expect(shipFacingFromSub(sub)).toBe(facing);
				expect(shipPhaseFromSub(sub)).toBe(phase);
			}
		}
	});

	it('phase→state map matches the server PHASE_* order', () => {
		// Mirrors pilot.rs PHASE_OFF..PHASE_ENTERING by index. Drift here = wrong anim
		// for a phase. The first four (off/lift/fly/land) are the core ground loop.
		expect(SHIP_PHASE_TO_STATE.slice(0, 4)).toEqual([
			'off',
			'lift',
			'fly',
			'land',
		]);
		// Indices 4/5 are the atmosphere cutscenes (space mode), if present.
		expect(shipPhaseFromSub(4 << 4)).toBe(4);
		expect(shipPhaseFromSub(5 << 4)).toBe(5);
	});
});

describe('ship sheet layout invariants', () => {
	it('loop/lift rigs are 8 frames × 16 facings (row-major dir*8+f)', () => {
		for (const k of ['lift', 'idle', 'move', 'bank'] as const) {
			expect(SHIP_SHEETS[k].frames).toBe(8);
			expect(SHIP_SHEETS[k].directions).toBe(16);
		}
	});

	it('atmosphere cutscenes are 16 frames × 1 facing', () => {
		for (const k of ['leaving', 'entering'] as const) {
			expect(SHIP_SHEETS[k].frames).toBe(16);
			expect(SHIP_SHEETS[k].directions).toBe(1);
		}
	});

	it('static off/on are one frame × 16 facings', () => {
		for (const k of ['off', 'on'] as const) {
			expect(SHIP_SHEETS[k].frames).toBe(1);
			expect(SHIP_SHEETS[k].directions).toBe(16);
		}
	});

	it('animated sheets upscale 1.6× to match the headroom-free static hull', () => {
		expect(SHIP_SHEETS.off.scale).toBe(1);
		expect(SHIP_SHEETS.on.scale).toBe(1);
		expect(SHIP_SHEETS.lift.scale).toBeCloseTo(1.6);
		expect(SHIP_SHEETS.idle.scale).toBeCloseTo(1.6);
	});
});
