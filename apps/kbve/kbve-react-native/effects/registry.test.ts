import { describe, expect, it } from 'vitest';
import { getEffect, listEffects, registerEffect } from './index';
import type { EffectRunner } from './types';

const noopRunner: EffectRunner = { frame() {}, dispose() {} };

describe('effect registry', () => {
	it('lists the built-in effects with id + label', () => {
		const list = listEffects();
		expect(list.length).toBeGreaterThanOrEqual(7);
		expect(list.find((e) => e.id === 'aurora')?.label).toBe('Aurora');
		expect(list.find((e) => e.id === 'themed')?.label).toBe('Themed');
	});

	it('resolves an init function for a known id', () => {
		expect(typeof getEffect('gradient')).toBe('function');
	});

	it('returns undefined for an unknown id', () => {
		expect(getEffect('does-not-exist')).toBeUndefined();
	});

	it('registers a new effect at runtime', () => {
		registerEffect({
			id: 'unit-fx',
			label: 'Unit',
			init: () => noopRunner,
		});
		expect(getEffect('unit-fx')).toBeDefined();
		expect(listEffects().find((e) => e.id === 'unit-fx')?.label).toBe(
			'Unit',
		);
	});
});
