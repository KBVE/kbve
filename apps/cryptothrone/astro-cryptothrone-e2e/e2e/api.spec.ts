import { test, expect } from '@playwright/test';

/**
 * axum-cryptothrone JSON game API. Only runs against the built server (docker
 * project) — astro dev has no /api routes. Mirrors the Rust unit-test contract.
 */
test.describe('axum game API', () => {
	test.beforeEach(() => {
		test.skip(
			test.info().project.name !== 'docker',
			'API is served by axum, not astro dev',
		);
	});

	test('health check reports status and version', async ({ request }) => {
		const res = await request.get('/health');
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('ok');
		expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test('lists all items as JSON', async ({ request }) => {
		const res = await request.get('/api/v1/items');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('application/json');
		const items = await res.json();
		expect(Array.isArray(items)).toBe(true);
		expect(items.length).toBe(5);
	});

	test('fetches a known item by id', async ({ request }) => {
		const res = await request.get('/api/v1/items/health_potion');
		expect(res.status()).toBe(200);
		expect((await res.json()).name).toBe('Health Potion');
	});

	test('unknown item returns 404', async ({ request }) => {
		const res = await request.get('/api/v1/items/nonexistent');
		expect(res.status()).toBe(404);
	});

	test('lists npcs', async ({ request }) => {
		const res = await request.get('/api/v1/npcs');
		expect(res.status()).toBe(200);
		expect((await res.json()).length).toBe(2);
	});

	test('fetches a known npc by id', async ({ request }) => {
		const res = await request.get('/api/v1/npcs/npc_barkeep');
		expect(res.status()).toBe(200);
		expect((await res.json()).name).toBe('Evee The BarKeep');
	});

	test('fetches a dialogue with options', async ({ request }) => {
		const res = await request.get('/api/v1/dialogues/dlg_barkeep_greeting');
		expect(res.status()).toBe(200);
		const dialogue = await res.json();
		expect(dialogue.title).toBe('Greeting');
		expect(Array.isArray(dialogue.options)).toBe(true);
	});

	test('speed endpoint returns server time in ms', async ({ request }) => {
		const res = await request.get('/api/v1/speed');
		expect(res.status()).toBe(200);
		expect((await res.json()).time_ms).toBeGreaterThan(0);
	});
});
