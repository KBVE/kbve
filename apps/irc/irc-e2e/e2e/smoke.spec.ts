import { test, expect } from '@playwright/test';

test.describe('Smoke: Health Endpoint', () => {
	test('GET /health returns OK', async ({ request }) => {
		const response = await request.get('/health');
		expect(response.status()).toBe(200);
		expect(await response.text()).toBe('OK');
	});
});

test.describe('Smoke: Security Headers', () => {
	test('responses include security headers', async ({ request }) => {
		const response = await request.get('/health');
		const headers = response.headers();

		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['referrer-policy']).toBe(
			'strict-origin-when-cross-origin',
		);
	});
});

test.describe('Smoke: CORS', () => {
	test('CORS headers are present', async ({ request }) => {
		const response = await request.get('/health');
		const headers = response.headers();

		expect(headers['access-control-allow-origin']).toBeTruthy();
	});
});

test.describe('Smoke: Unknown Routes', () => {
	test('unknown route returns 404', async ({ request }) => {
		const response = await request.get('/this-route-does-not-exist');
		expect(response.status()).toBe(404);
	});
});
