import { describe, it, expect, vi, beforeEach } from 'vitest';
import { droid } from './droid';

beforeEach(() => {
	delete (window as any).kbve;
});

describe('droid', () => {
	it(
		'should initialize and attach to window.kbve',
		async () => {
			const result = await droid();

			expect(result).toEqual({ initialized: true });
			expect(window.kbve).toBeDefined();
			expect(window.kbve?.api).toBeDefined();
			expect(window.kbve?.i18n).toBeDefined();
			expect(window.kbve?.uiux).toBeDefined();
			expect(window.kbve?.ws).toBeDefined();
			expect(window.kbve?.data).toBeDefined();

		},
		10_000,
	);
});