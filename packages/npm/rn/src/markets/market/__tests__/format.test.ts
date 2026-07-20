import { describe, it, expect } from 'vitest';
import { formatKhash, itemRefLabel, itemRefHasEnchants } from '../format';

describe('format', () => {
	it('formatKhash', () => {
		expect(formatKhash(null)).toBe('—');
		expect(formatKhash(1500)).toBe('1,500 KHash');
	});
	it('itemRefLabel', () => {
		expect(itemRefLabel({ kind: 'mc_item', id: 'diamond' })).toBe(
			'mc_item:diamond',
		);
		expect(itemRefLabel({ id: 'x' })).toBe('x');
		expect(itemRefLabel(5)).toBe('Unknown item');
	});
	it('itemRefHasEnchants', () => {
		expect(itemRefHasEnchants({ enchants: [{}] })).toBe(true);
		expect(itemRefHasEnchants({ enchants: [] })).toBe(false);
		expect(itemRefHasEnchants({})).toBe(false);
	});
});
