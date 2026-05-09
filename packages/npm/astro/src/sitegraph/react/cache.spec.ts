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

	it('falls back to direct fetch when the worker rejects', async () => {
		// Wire a "worker" port that responds with an error to every request,
		// the same shape the real SharedWorker posts on its error path.
		const port = {
			postMessage: vi.fn(function (
				this: void,
				msg: { requestId: string },
			) {
				queueMicrotask(() => {
					(port.onmessage as (e: MessageEvent) => void)?.({
						data: {
							type: 'error',
							requestId: msg.requestId,
							message: 'simulated worker fetch failure',
						},
					} as MessageEvent);
				});
			}),
			onmessage: null as ((e: MessageEvent) => void) | null,
			start: () => {},
		} as unknown as MessagePort;
		setSiteGraphWorker(port);

		const fetchMock = globalThis.fetch as unknown as ReturnType<
			typeof vi.fn
		>;
		const result = await fetchSiteGraph();
		expect(result).toEqual(sample);
		// Fallback path called the global fetch exactly once.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
