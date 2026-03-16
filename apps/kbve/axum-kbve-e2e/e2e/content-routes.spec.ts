import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { fetchAllSitemapPaths, samplePaths } from './helpers/sitemap';

/**
 * Dynamic content route tests — pulls routes from the sitemap and
 * API JSON endpoints served by the Docker container itself. No
 * hardcoded paths means these tests stay current as content changes.
 */

const DB_PREFIXES = [
	{ prefix: '/itemdb/', label: 'ItemDB' },
	{ prefix: '/mapdb/', label: 'MapDB' },
	{ prefix: '/npcdb/', label: 'NpcDB' },
	{ prefix: '/questdb/', label: 'QuestDB' },
] as const;

interface ApiEndpoint {
	path: string;
	label: string;
	itemsKey: string;
	indexKey: string;
	refPrefix: string;
}

const API_ENDPOINTS: ApiEndpoint[] = [
	{
		path: '/api/itemdb.json',
		label: 'ItemDB',
		itemsKey: 'items',
		indexKey: 'index',
		refPrefix: '/itemdb/',
	},
	{
		path: '/api/mapdb.json',
		label: 'MapDB',
		itemsKey: 'objects',
		indexKey: 'index',
		refPrefix: '/mapdb/',
	},
	{
		path: '/api/npcdb.json',
		label: 'NpcDB',
		itemsKey: 'npcs',
		indexKey: 'index',
		refPrefix: '/npcdb/',
	},
	{
		path: '/api/questdb.json',
		label: 'QuestDB',
		itemsKey: 'quests',
		indexKey: 'key',
		refPrefix: '/questdb/',
	},
];

let sitemapPaths: string[] = [];

describe('Content routes (sitemap-driven)', () => {
	beforeAll(async () => {
		await waitForReady();
		sitemapPaths = await fetchAllSitemapPaths();
	});

	it('sitemap-index.xml is reachable', async () => {
		const res = await fetch(`${BASE_URL}/sitemap-index.xml`);
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain('<sitemapindex');
	});

	it('sitemap contains content routes', () => {
		expect(sitemapPaths.length).toBeGreaterThan(0);
	});

	for (const { prefix, label } of DB_PREFIXES) {
		describe(`${label} routes from sitemap`, () => {
			it(`sitemap contains ${label} entries`, () => {
				const matching = sitemapPaths.filter((p) =>
					p.startsWith(prefix),
				);
				expect(matching.length).toBeGreaterThan(0);
			});

			it(`sampled ${label} routes return 200 HTML`, async () => {
				const sample = samplePaths(sitemapPaths, prefix, 5);
				expect(sample.length).toBeGreaterThan(0);

				for (const path of sample) {
					const res = await fetch(`${BASE_URL}${path}`);
					expect(res.status, `${path} should return 200`).toBe(200);

					const ct = res.headers.get('content-type') ?? '';
					expect(ct, `${path} should serve HTML`).toContain(
						'text/html',
					);
				}
			});
		});
	}

	describe('Items are NOT served at root level', () => {
		it('root-level item refs return 404', async () => {
			// Grab a few refs from the API to test against root
			const res = await fetch(`${BASE_URL}/api/itemdb.json`);
			if (res.status !== 200) return;

			const data = await res.json();
			const refs: string[] = (data.items ?? [])
				.slice(0, 3)
				.map((item: Record<string, unknown>) => item.ref)
				.filter(Boolean);

			for (const ref of refs) {
				const rootRes = await fetch(`${BASE_URL}/${ref}/`);
				expect(
					rootRes.status,
					`/${ref}/ should NOT exist at root`,
				).toBe(404);
			}
		});
	});
});

describe('API JSON endpoints (dynamic)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const ep of API_ENDPOINTS) {
		describe(ep.label, () => {
			it(`GET ${ep.path} returns valid JSON`, async () => {
				const res = await fetch(`${BASE_URL}${ep.path}`);
				expect(res.status).toBe(200);
				const data = await res.json();
				expect(data).toHaveProperty(ep.itemsKey);
				expect(data).toHaveProperty(ep.indexKey);
				const items = data[ep.itemsKey];
				expect(Array.isArray(items)).toBe(true);
				expect(items.length).toBeGreaterThan(0);
			});

			it(`${ep.label} items use ref field, not slug`, async () => {
				const res = await fetch(`${BASE_URL}${ep.path}`);
				const data = await res.json();
				const first = data[ep.itemsKey]?.[0];
				if (!first) return;
				expect(first).toHaveProperty('ref');
				expect(first).not.toHaveProperty('slug');
			});

			it(`${ep.label} refs resolve to valid routes`, async () => {
				const res = await fetch(`${BASE_URL}${ep.path}`);
				const data = await res.json();
				const items = (data[ep.itemsKey] ?? []).slice(0, 3);

				for (const item of items) {
					const ref = item.ref;
					if (!ref) continue;
					const routeRes = await fetch(
						`${BASE_URL}${ep.refPrefix}${ref}/`,
					);
					expect(
						routeRes.status,
						`${ep.refPrefix}${ref}/ should return 200`,
					).toBe(200);
				}
			});
		});
	}
});
