import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSiteGraph, resetSiteGraphCache } from './cache';
import { setSiteGraphWorker } from './worker-client';

describe('fetchSiteGraph', () => {
	const sample = { a: { title: 'A', links: [], backlinks: [] } };

	beforeEach(() => {
		resetSiteGraphCache();
		setSiteGraphWorker(null);
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(sample),
				} as Response),
			),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('single-flights concurrent calls', async () => {
		const fetchMock = globalThis.fetch as unknown as ReturnType<
			typeof vi.fn
		>;
		const [a, b] = await Promise.all([fetchSiteGraph(), fetchSiteGraph()]);
		expect(a).toBe(b);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('caches result across calls', async () => {
		const fetchMock = globalThis.fetch as unknown as ReturnType<
			typeof vi.fn
		>;
		await fetchSiteGraph();
		await fetchSiteGraph();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reset clears the cache', async () => {
		const fetchMock = globalThis.fetch as unknown as ReturnType<
			typeof vi.fn
		>;
		await fetchSiteGraph();
		resetSiteGraphCache();
		await fetchSiteGraph();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('rejects + uncaches on HTTP error so callers can retry', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve({ ok: false, status: 500 } as Response),
			),
		);
		await expect(fetchSiteGraph()).rejects.toThrow('HTTP 500');

		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(sample),
				} as Response),
			),
		);
		await expect(fetchSiteGraph()).resolves.toEqual(sample);
	});
});
