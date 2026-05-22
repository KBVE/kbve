import { describe, expect, it } from 'vitest';
import { rollEnemyType } from './config';
import { mulberry32 } from './random';

describe('rollEnemyType (seeded)', () => {
	it('same seed + wave returns same sequence', () => {
		const a = mulberry32(424242);
		const b = mulberry32(424242);
		for (let wave = 1; wave <= 10; wave++) {
			expect(rollEnemyType(wave, a)).toBe(rollEnemyType(wave, b));
		}
	});

	it('wave 1 returns runner-heavy distribution', () => {
		const r = mulberry32(1);
		let runners = 0;
		for (let i = 0; i < 200; i++) {
			if (rollEnemyType(1, r) === 'runner') runners++;
		}
		expect(runners).toBeGreaterThan(120);
	});

	it('does not roll flying before wave 4', () => {
		const r = mulberry32(2);
		for (let i = 0; i < 200; i++) {
			expect(rollEnemyType(3, r)).not.toBe('flying');
		}
	});

	it('does not roll shielded before wave 6', () => {
		const r = mulberry32(3);
		for (let i = 0; i < 200; i++) {
			expect(rollEnemyType(5, r)).not.toBe('shielded');
		}
	});

	it('does not roll regen before wave 8', () => {
		const r = mulberry32(4);
		for (let i = 0; i < 200; i++) {
			expect(rollEnemyType(7, r)).not.toBe('regen');
		}
	});
});
