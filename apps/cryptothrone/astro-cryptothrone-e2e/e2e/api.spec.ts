import { test, expect } from '@playwright/test';

/**
 * axum-cryptothrone server endpoints (/health, /api/v1/speed). Only runs
 * against the built server (docker project) — astro dev has no axum routes.
 * Game data is bundled client-side + canonical on kbve.com, so there is no
 * game-data API to serve.
 */
test.describe('axum API', () => {
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

	test('speed endpoint returns server time in ms', async ({ request }) => {
		const res = await request.get('/api/v1/speed');
		expect(res.status()).toBe(200);
		expect((await res.json()).time_ms).toBeGreaterThan(0);
	});
});
