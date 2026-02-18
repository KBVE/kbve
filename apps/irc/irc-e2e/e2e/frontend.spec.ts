import { test, expect } from '@playwright/test';

test.describe('Frontend: Index Page', () => {
	test('GET / returns HTML with 200', async ({ request }) => {
		const response = await request.get('/');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('index page contains expected content', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/IRC/i);
	});
});

test.describe('Frontend: 404 Page', () => {
	test('unknown route returns 404 with HTML', async ({ request }) => {
		const response = await request.get('/this-route-does-not-exist');
		expect(response.status()).toBe(404);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('404 page renders in browser', async ({ page }) => {
		const response = await page.goto('/this-route-does-not-exist');
		expect(response?.status()).toBe(404);
		await expect(page.locator('body')).toContainText('404');
	});
});

test.describe('Frontend: Auth Pages', () => {
	test('GET /auth/ returns HTML', async ({ request }) => {
		const response = await request.get('/auth/', {
			maxRedirects: 0,
		});
		const status = response.status();
		// Auth index redirects to / or serves HTML
		expect([200, 301, 302]).toContain(status);
	});

	test('GET /auth/callback returns HTML', async ({ request }) => {
		const response = await request.get('/auth/callback');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('GET /auth/logout returns HTML', async ({ request }) => {
		const response = await request.get('/auth/logout');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});
});

test.describe('Frontend: Security Headers on Static Pages', () => {
	test('static pages include security headers', async ({ request }) => {
		const response = await request.get('/');
		const headers = response.headers();

		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['referrer-policy']).toBe(
			'strict-origin-when-cross-origin',
		);
	});
});
