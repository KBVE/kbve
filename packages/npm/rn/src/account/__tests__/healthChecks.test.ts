import { describe, it, expect } from 'vitest';
import { evaluateHealthChecks } from '../healthChecks';

describe('evaluateHealthChecks', () => {
	it('reports ok for available capabilities', () => {
		const checks = evaluateHealthChecks({
			serviceWorker: true,
			storage: true,
			indexedDB: true,
			online: true,
		});
		const map = Object.fromEntries(checks.map((c) => [c.label, c.status]));
		expect(map['Service Worker']).toBe('ok');
		expect(map['Local Storage']).toBe('ok');
		expect(map['IndexedDB']).toBe('ok');
		expect(map['Network']).toBe('ok');
	});

	it('reports unavailable for missing capabilities and offline network', () => {
		const checks = evaluateHealthChecks({
			serviceWorker: false,
			storage: false,
			indexedDB: false,
			online: false,
		});
		const map = Object.fromEntries(checks.map((c) => [c.label, c.status]));
		expect(map['Service Worker']).toBe('unavailable');
		expect(map['Network']).toBe('error');
	});
});
