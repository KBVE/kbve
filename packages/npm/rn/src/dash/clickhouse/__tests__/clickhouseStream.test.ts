import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClickHouseStream, buildStatsTotals, CH_DEFAULT_VIEWS } from '../clickhouseStream';

describe('clickhouseStream v2', () => {
	const getToken = vi.fn(async () => 'tok');
	beforeEach(() => { vi.clearAllMocks(); });

	it('query body carries params (minutes 360 default, limit 500)', async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [] }) });
		global.fetch = fetchSpy;
		const store = createClickHouseStream({ getToken });
		await store.refresh();
		const body = JSON.parse(fetchSpy.mock.calls.find((c) => JSON.parse(c[1].body).command === 'query')![1].body);
		expect(body).toMatchObject({ command: 'query', minutes: 360, limit: 500 });
	});

	it('ALL sends minutes:0', async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [] }) });
		global.fetch = fetchSpy;
		const store = createClickHouseStream({ getToken });
		store.setParams({ minutes: 0 });
		await Promise.resolve(); await Promise.resolve();
		const last = fetchSpy.mock.calls.map((c) => JSON.parse(c[1].body)).filter((b) => b.command === 'query').pop();
		expect(last.minutes).toBe(0);
	});

	it('every CH_DEFAULT_VIEWS entry preserves limit:500', () => {
		for (const view of CH_DEFAULT_VIEWS) {
			expect(view.params.limit).toBe(500);
		}
	});

	it('buildStatsTotals sums count() from stats meta (uncapped)', () => {
		const meta = { rows: [
			{ pod_namespace: 'a', service: 's', level: 'error', cnt: 30 },
			{ pod_namespace: 'a', service: 's', level: 'info', cnt: 1200 },
			{ pod_namespace: 'b', service: 's', level: 'warn', cnt: 45 },
		] };
		expect(buildStatsTotals(meta)).toEqual({ total: 1275, errors: 30, warnings: 45 });
	});
});
