import { describe, it, expect } from 'vitest';
import { toStorageInfo } from '../storageMath';

describe('toStorageInfo', () => {
	it('computes percent from usage/quota', () => {
		const info = toStorageInfo(50, 200, 7);
		expect(info).toEqual({
			usage: 50,
			quota: 200,
			percent: 25,
			itemCount: 7,
		});
	});

	it('rounds percent to nearest integer', () => {
		expect(toStorageInfo(1, 3, 0).percent).toBe(33);
	});

	it('returns 0 percent when quota is 0', () => {
		expect(toStorageInfo(10, 0, 0).percent).toBe(0);
	});

	it('clamps percent to 100 max', () => {
		expect(toStorageInfo(300, 200, 0).percent).toBe(100);
	});
});
