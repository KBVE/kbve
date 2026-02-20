import { test, expect } from '@playwright/test';

// ─── Starlight Index / Splash Page ──────────────────────────────────────────
// The Astro build produces index.html at the root. The Axum gateway serves it
// via ServeDir with append_index_html_on_directories(true).

test.describe('Frontend: Index Page', () => {
	test('GET / returns 200 with HTML', async ({ request }) => {
		const response = await request.get('/');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('index page title contains site name', async ({ page }) => {
		await page.goto('/');
		// Starlight sets <title> from the config: "KBVE IRC"
		await expect(page).toHaveTitle(/KBVE\s*IRC/i);
	});
});

// ─── 404 Handling ───────────────────────────────────────────────────────────
// The gateway loads 404.html from the Astro build and returns it as the
// fallback response for unknown routes.

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

// ─── Auth Pages (Astro pages served through the Axum gateway) ───────────────
// Auth routes live in src/pages/auth/ and build to auth/*/index.html.
// ServeDir requires a trailing slash for directory resolution; without it the
// gateway returns 301 → /path/. Tests use trailing slashes to hit the pages
// directly, plus one redirect test to validate the 301 behaviour.

test.describe('Frontend: Auth Pages', () => {
	test('GET /auth/ serves the auth index page', async ({ request }) => {
		const response = await request.get('/auth/');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('GET /auth/callback/ serves the callback page', async ({
		request,
	}) => {
		const response = await request.get('/auth/callback/');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('GET /auth/logout/ serves the logout page', async ({ request }) => {
		const response = await request.get('/auth/logout/');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('GET /auth/callback without trailing slash redirects', async ({
		request,
	}) => {
		const response = await request.get('/auth/callback', {
			maxRedirects: 0,
		});
		expect([301, 307]).toContain(response.status());
	});
});

// ─── Starlight Content Pages ────────────────────────────────────────────────
// Starlight generates pages from src/content/docs/ into the build output.
// Validate that the guides section builds and serves correctly.

test.describe('Frontend: Starlight Content Pages', () => {
	test('GET /guides/getting-started/ returns 200 with HTML', async ({
		request,
	}) => {
		const response = await request.get('/guides/getting-started/');
		expect(response.status()).toBe(200);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/html');
	});

	test('getting-started page renders with correct title', async ({
		page,
	}) => {
		await page.goto('/guides/getting-started/');
		// Starlight titles: "<page title> | <site title>"
		await expect(page).toHaveTitle(/Getting Started/i);
	});
});

// ─── Security Headers on Static Pages ───────────────────────────────────────
// The Axum middleware adds security headers to every response.

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
