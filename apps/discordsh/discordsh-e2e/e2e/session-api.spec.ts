import { test, expect } from '@playwright/test';

test.describe('Session API: JSON Endpoint', () => {
	test('GET /api/session/{id} returns 404 JSON for missing session', async ({
		request,
	}) => {
		const response = await request.get('/api/session/deadbeef');
		expect(response.status()).toBe(404);

		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('application/json');

		const json = await response.json();
		expect(json.error).toBe('session not found');
	});

	test('GET /api/session/{id} 404 response has correct structure', async ({
		request,
	}) => {
		const response = await request.get('/api/session/00000000');
		expect(response.status()).toBe(404);

		const json = await response.json();
		expect(Object.keys(json)).toEqual(['error']);
		expect(typeof json.error).toBe('string');
	});

	test('GET /api/session/ without ID returns 404', async ({ request }) => {
		const response = await request.get('/api/session/');
		// Axum should 404 or 405 on missing path segment
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});

	test('API 404 includes security headers', async ({ request }) => {
		const response = await request.get('/api/session/nonexistent');
		const headers = response.headers();
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
	});
});

test.describe('Session Viewer: HTML Page', () => {
	test('GET /session/{id} returns 404 for missing session', async ({
		request,
	}) => {
		const response = await request.get('/session/deadbeef');
		expect(response.status()).toBe(404);
	});

	test('/session/{id} 404 returns plain text, not JSON', async ({
		request,
	}) => {
		const response = await request.get('/session/deadbeef');
		expect(response.status()).toBe(404);

		const body = await response.text();
		expect(body).toContain('Session not found');

		// Should NOT be JSON
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).not.toContain('application/json');
	});

	test('/session/ without ID returns 404', async ({ request }) => {
		const response = await request.get('/session/');
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});

	test('session viewer 404 includes security headers', async ({
		request,
	}) => {
		const response = await request.get('/session/nonexistent');
		const headers = response.headers();
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['referrer-policy']).toBe(
			'strict-origin-when-cross-origin',
		);
	});
});
