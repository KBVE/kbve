import { describe, it, expect } from 'vitest';
import { resolveSelectOptions } from '../ControlBar';
import type { StreamControl } from '../../types';

describe('ControlBar helpers', () => {
	it('resolveSelectOptions prefers static options', () => {
		const c: StreamControl = { kind: 'select', param: 'ns', options: [{ label: 'A', value: 'a' }] };
		expect(resolveSelectOptions(c, null)).toEqual([{ label: 'A', value: 'a' }]);
	});
	it('resolveSelectOptions falls back to optionsFromMeta', () => {
		const c: StreamControl = {
			kind: 'select', param: 'ns',
			optionsFromMeta: (m) => (m as string[]).map((v) => ({ label: v, value: v })),
		};
		expect(resolveSelectOptions(c, ['x', 'y'])).toEqual([
			{ label: 'x', value: 'x' }, { label: 'y', value: 'y' },
		]);
	});
	it('resolveSelectOptions returns [] when neither present', () => {
		const c: StreamControl = { kind: 'select', param: 'ns' };
		expect(resolveSelectOptions(c, null)).toEqual([]);
	});
});
