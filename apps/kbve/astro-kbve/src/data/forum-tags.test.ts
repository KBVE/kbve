import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';

const realFetch = globalThis.fetch;

async function freshModule() {
	vi.resetModules();
	return await import('./forum-tags');
}

function jsonResponse(body: unknown, ok = true, status = 200) {
	return Promise.resolve({
		ok,
		status,
		json: () => Promise.resolve(body),
	} as Response);
}

describe('getForumTopTags', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		// Replace AbortSignal.timeout with a never-aborting signal so the
		// production code's 5s real-timer can't race vitest's own 5s
		// testTimeout under heavy CI load. The mock fetch resolves
		// synchronously anyway, so a real timeout serves no purpose here.
		vi.spyOn(AbortSignal, 'timeout').mockImplementation(
			() => new AbortController().signal,
		);
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
	});

	it('returns tags from upstream, sliced to the requested limit', async () => {
		const tags = Array.from({ length: 20 }, (_, i) => ({
			id: i,
			slug: `t${i}`,
			name: `Tag ${i}`,
			description: null,
			thread_count: i,
		}));
		globalThis.fetch = vi.fn(() =>
			jsonResponse({ tags }),
		) as unknown as typeof fetch;

		const { getForumTopTags } = await freshModule();
		const result = await getForumTopTags(5);
		expect(result).toHaveLength(5);
		expect(result[0].slug).toBe('t0');
	});

	it('default limit is 12', async () => {
		const tags = Array.from({ length: 50 }, (_, i) => ({
			id: i,
			slug: `t${i}`,
			name: `Tag ${i}`,
			description: null,
			thread_count: i,
		}));
		globalThis.fetch = vi.fn(() =>
			jsonResponse({ tags }),
		) as unknown as typeof fetch;

		const { getForumTopTags } = await freshModule();
		const result = await getForumTopTags();
		expect(result).toHaveLength(12);
	});

	it('returns empty array on non-ok upstream response', async () => {
		globalThis.fetch = vi.fn(() =>
			jsonResponse({}, false, 503),
		) as unknown as typeof fetch;

		const { getForumTopTags } = await freshModule();
		const result = await getForumTopTags(5);
		expect(result).toEqual([]);
	});

	it('returns empty array on fetch rejection', async () => {
		globalThis.fetch = vi.fn(() =>
			Promise.reject(new Error('ECONNREFUSED')),
		) as unknown as typeof fetch;

		const { getForumTopTags } = await freshModule();
		const result = await getForumTopTags(3);
		expect(result).toEqual([]);
	});

	it('returns empty array when response body lacks a tags array', async () => {
		globalThis.fetch = vi.fn(() =>
			jsonResponse({ tags: 'not-an-array' }),
		) as unknown as typeof fetch;

		const { getForumTopTags } = await freshModule();
		const result = await getForumTopTags(3);
		expect(result).toEqual([]);
	});

	it('caches across calls — fetch only fires once', async () => {
		const tags = [
			{
				id: 1,
				slug: 'a',
				name: 'A',
				description: null,
				thread_count: 0,
			},
		];
		const spy = vi.fn(() => jsonResponse({ tags }));
		globalThis.fetch = spy as unknown as typeof fetch;

		const { getForumTopTags } = await freshModule();
		await getForumTopTags(1);
		await getForumTopTags(1);
		await getForumTopTags(1);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('caches the empty fallback so failures do not retry on every call', async () => {
		const spy = vi.fn(() =>
			Promise.reject(new Error('boom')),
		) as unknown as typeof fetch;
		globalThis.fetch = spy;

		const { getForumTopTags } = await freshModule();
		await getForumTopTags();
		await getForumTopTags();
		expect(
			spy as unknown as ReturnType<typeof vi.fn>,
		).toHaveBeenCalledTimes(1);
	});

	it('fuzz: limit parameter is always respected', async () => {
		const tags = Array.from({ length: 30 }, (_, i) => ({
			id: i,
			slug: `t${i}`,
			name: `Tag ${i}`,
			description: null,
			thread_count: i,
		}));
		globalThis.fetch = vi.fn(() =>
			jsonResponse({ tags }),
		) as unknown as typeof fetch;

		const { getForumTopTags } = await freshModule();
		await fc.assert(
			fc.asyncProperty(fc.integer({ min: 0, max: 50 }), async (limit) => {
				const r = await getForumTopTags(limit);
				return r.length === Math.min(limit, tags.length);
			}),
			{ numRuns: 30 },
		);
	});
});
