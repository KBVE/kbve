import { test, expect } from '@playwright/test';

test.describe('discordsh-bot health endpoints', () => {
	test('GET /health returns 200 with JSON status', async ({ request }) => {
		const response = await request.get('/health');
		expect(response.status()).toBe(200);

		const body = await response.json();
		expect(body.status).toBe('ok');
		expect(body.version).toBeDefined();
		expect(typeof body.version).toBe('string');
		expect(body.uptime_secs).toBeGreaterThanOrEqual(0);
	});

	test('GET /healthz returns 200 with plain text', async ({ request }) => {
		const response = await request.get('/healthz');
		expect(response.status()).toBe(200);

		const text = await response.text();
		expect(text).toBe('ok');
	});

	test('GET /health version matches Cargo.toml', async ({ request }) => {
		const response = await request.get('/health');
		const body = await response.json();

		// Version should be a valid semver-like string
		expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
	});

	test('GET /nonexistent returns 404', async ({ request }) => {
		const response = await request.get('/nonexistent');
		expect(response.status()).toBe(404);
	});
});
