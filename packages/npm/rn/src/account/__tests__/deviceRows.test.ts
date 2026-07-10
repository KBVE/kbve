import { describe, it, expect } from 'vitest';
import { webDeviceRows } from '../deviceRows';

describe('webDeviceRows', () => {
	it('builds labelled rows from a navigator-like object', () => {
		const rows = webDeviceRows({
			userAgent: 'Mozilla/5.0 (Macintosh)',
			platform: 'MacIntel',
			language: 'en-US',
			hardwareConcurrency: 8,
			deviceMemory: 16,
			onLine: true,
		});
		const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
		expect(map['Platform']).toBe('MacIntel');
		expect(map['Language']).toBe('en-US');
		expect(map['CPU cores']).toBe('8');
		expect(map['Memory']).toBe('16 GB');
		expect(map['Network']).toBe('Online');
	});

	it('omits rows for missing fields and shows Offline', () => {
		const rows = webDeviceRows({ platform: 'Linux', onLine: false });
		const labels = rows.map((r) => r.label);
		expect(labels).not.toContain('CPU cores');
		expect(labels).not.toContain('Memory');
		const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
		expect(map['Network']).toBe('Offline');
	});
});
