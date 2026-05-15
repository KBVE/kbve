import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const realFetch = globalThis.fetch;

async function freshModule() {
	vi.resetModules();
	return await import('./forum-spaces');
}

function jsonResponse(body: unknown, ok = true, status = 200) {
	return Promise.resolve({
		ok,
		status,
		json: () => Promise.resolve(body),
	} as Response);
}

describe('getForumSpaces', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
	});

	it('returns upstream spaces when non-empty', async () => {
		const spaces = [
			{
				id: 'x',
				slug: 'general',
				name: 'General',
				description: null,
				status: 'active',
			},
		];
		globalThis.fetch = vi.fn(() =>
			jsonResponse({ spaces }),
		) as unknown as typeof fetch;

		const { getForumSpaces } = await freshModule();
		const r = await getForumSpaces();
		expect(r).toEqual(spaces);
	});

	it('falls back to hardcoded mirror when upstream returns empty', async () => {
		globalThis.fetch = vi.fn(() =>
			jsonResponse({ spaces: [] }),
		) as unknown as typeof fetch;

		const { getForumSpaces } = await freshModule();
		const r = await getForumSpaces();
		expect(r.length).toBeGreaterThan(0);
		expect(r.some((s) => s.slug === 'announcements')).toBe(true);
		expect(r.some((s) => s.slug === 'support')).toBe(true);
	});

	it('falls back to hardcoded mirror on non-ok upstream', async () => {
		globalThis.fetch = vi.fn(() =>
			jsonResponse({}, false, 500),
		) as unknown as typeof fetch;

		const { getForumSpaces } = await freshModule();
		const r = await getForumSpaces();
		expect(r.some((s) => s.slug === 'announcements')).toBe(true);
	});

	it('falls back to hardcoded mirror on fetch rejection', async () => {
		globalThis.fetch = vi.fn(() =>
			Promise.reject(new Error('network')),
		) as unknown as typeof fetch;

		const { getForumSpaces } = await freshModule();
		const r = await getForumSpaces();
		expect(r.length).toBeGreaterThan(0);
	});

	it('caches result across repeated calls', async () => {
		const spaces = [
			{
				id: 'x',
				slug: 'g',
				name: 'G',
				description: null,
				status: 'active',
			},
		];
		const spy = vi.fn(() => jsonResponse({ spaces }));
		globalThis.fetch = spy as unknown as typeof fetch;

		const { getForumSpaces } = await freshModule();
		await getForumSpaces();
		await getForumSpaces();
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('every fallback space has the required shape', async () => {
		globalThis.fetch = vi.fn(() =>
			Promise.reject(new Error('down')),
		) as unknown as typeof fetch;

		const { getForumSpaces } = await freshModule();
		const r = await getForumSpaces();
		for (const s of r) {
			expect(typeof s.slug).toBe('string');
			expect(typeof s.name).toBe('string');
			expect(typeof s.status).toBe('string');
			expect(['string', 'object']).toContain(typeof s.description);
		}
	});
});
