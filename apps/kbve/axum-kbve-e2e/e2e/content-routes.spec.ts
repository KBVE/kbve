import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

/**
 * Content route tests — verify that the Docker container serves
 * Starlight-generated pages at their correct nested paths.
 *
 * These catch routing regressions like the slug-override bug where
 * /itemdb/beer/ was incorrectly served at /beer/ instead.
 */

const ITEMDB_ROUTES = [
	'/itemdb/',
	'/itemdb/beer/',
	'/itemdb/alchemist-stardust/',
	'/itemdb/rusty-sword/',
	'/itemdb/bomb/',
	'/itemdb/potion/',
	'/itemdb/campfire-kit/',
];

const MAPDB_ROUTES = [
	'/mapdb/coal-vein/',
	'/mapdb/sunken-market/',
	'/mapdb/prismatic-throne/',
];

const NPCDB_ROUTES = ['/npcdb/glass-slime/', '/npcdb/fire-imp/'];

const QUESTDB_ROUTES = ['/questdb/auto-cooker-9000/'];

const ALL_CONTENT_ROUTES = [
	...ITEMDB_ROUTES,
	...MAPDB_ROUTES,
	...NPCDB_ROUTES,
	...QUESTDB_ROUTES,
];

describe('Content routes', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe.each(ALL_CONTENT_ROUTES)('%s', (path) => {
		it('returns 200', async () => {
			const res = await fetch(`${BASE_URL}${path}`);
			expect(res.status).toBe(200);
		});

		it('serves HTML', async () => {
			const res = await fetch(`${BASE_URL}${path}`);
			const contentType = res.headers.get('content-type') ?? '';
			expect(contentType).toContain('text/html');
		});
	});

	describe('ItemDB routes are NOT at root level', () => {
		it('/beer/ should 404 (not served at root)', async () => {
			const res = await fetch(`${BASE_URL}/beer/`);
			expect(res.status).toBe(404);
		});

		it('/alchemist-stardust/ should 404 (not served at root)', async () => {
			const res = await fetch(`${BASE_URL}/alchemist-stardust/`);
			expect(res.status).toBe(404);
		});

		it('/rusty-sword/ should 404 (not served at root)', async () => {
			const res = await fetch(`${BASE_URL}/rusty-sword/`);
			expect(res.status).toBe(404);
		});
	});

	describe('API JSON endpoints', () => {
		it('GET /api/itemdb.json returns valid JSON with items', async () => {
			const res = await fetch(`${BASE_URL}/api/itemdb.json`);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('items');
			expect(data).toHaveProperty('index');
			expect(Array.isArray(data.items)).toBe(true);
			expect(data.items.length).toBeGreaterThan(0);
		});

		it('GET /api/mapdb.json returns valid JSON with objects', async () => {
			const res = await fetch(`${BASE_URL}/api/mapdb.json`);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('objects');
			expect(data).toHaveProperty('index');
		});

		it('GET /api/npcdb.json returns valid JSON with npcs', async () => {
			const res = await fetch(`${BASE_URL}/api/npcdb.json`);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('npcs');
			expect(data).toHaveProperty('index');
		});

		it('GET /api/questdb.json returns valid JSON with quests', async () => {
			const res = await fetch(`${BASE_URL}/api/questdb.json`);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('quests');
			expect(data).toHaveProperty('key');
		});

		it('itemdb.json uses ref field instead of slug', async () => {
			const res = await fetch(`${BASE_URL}/api/itemdb.json`);
			const data = await res.json();
			const firstItem = data.items[0];
			expect(firstItem).toHaveProperty('ref');
			expect(firstItem).not.toHaveProperty('slug');
		});
	});
});
