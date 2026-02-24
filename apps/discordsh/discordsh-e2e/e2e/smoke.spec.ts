import { test, expect } from '@playwright/test';
import { sampleRoutes } from './sampler';

test.describe('Smoke: Page Loading', () => {
	test('main page loads with 200', async ({ page }) => {
		const response = await page.goto('/');
		expect(response).not.toBeNull();
		expect(response!.status()).toBe(200);
		await expect(page.locator('html')).toBeVisible();
	});

	test('404 page returns Astro custom 404', async ({ page }) => {
		const response = await page.goto('/this-route-does-not-exist');
		expect(response).not.toBeNull();
		expect(response!.status()).toBe(404);

		const body = await page.content();
		expect(body.length).toBeGreaterThan(100);
		expect(body).not.toContain('<h1>404 - Not Found</h1>');
	});
});

test.describe('Smoke: Health Endpoint', () => {
	test('GET /health returns JSON with status ok', async ({ request }) => {
		const response = await request.get('/health');
		expect(response.status()).toBe(200);

		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('application/json');

		const json = await response.json();
		expect(json.status).toBe('ok');
	});

	test('GET /healthz returns plain text ok', async ({ request }) => {
		const response = await request.get('/healthz');
		expect(response.status()).toBe(200);
		expect(await response.text()).toBe('ok');
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

test.describe('Smoke: Cache-Control Headers', () => {
	test('HTML pages have 86400 cache', async ({ request }) => {
		const response = await request.get('/');
		const cc = response.headers()['cache-control'] ?? '';
		expect(cc).toContain('max-age=86400');
	});

	test('/_astro/ assets have immutable cache', async ({ page }) => {
		const astroRequests: { cacheControl: string; url: string }[] = [];

		page.on('response', (resp) => {
			if (new URL(resp.url()).pathname.startsWith('/_astro/')) {
				astroRequests.push({
					url: resp.url(),
					cacheControl: resp.headers()['cache-control'] ?? '',
				});
			}
		});

		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');

		if (astroRequests.length > 0) {
			for (const req of astroRequests) {
				expect(req.cacheControl).toContain('immutable');
				expect(req.cacheControl).toContain('31536000');
			}
		}
	});
});

// ---------------------------------------------------------------------------
// Sitemap-driven route sampling
// ---------------------------------------------------------------------------

const BASE_URL = process.env['BASE_URL'] || 'http://localhost:4321';

test.describe('Smoke: Sitemap Routes', () => {
	test('sitemap exists and is parseable', async ({ request }) => {
		const response = await request.get('/sitemap-index.xml');
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).toContain('<loc>');
	});

	test('core + sampled routes all return 200', async ({ page, request }) => {
		const { core, sampled, all } = await sampleRoutes(BASE_URL);

		test.info().annotations.push(
			{ type: 'core_routes', description: core.join(', ') },
			{
				type: 'sampled_routes',
				description: sampled.join(', ') || '(none)',
			},
			{
				type: 'seed',
				description: process.env['GITHUB_RUN_ID'] || '42 (local)',
			},
		);

		for (const route of all) {
			await test.step(`GET ${route} → 200`, async () => {
				const resp = await request.get(route);
				expect(
					resp.status(),
					`${route} returned ${resp.status()}`,
				).toBe(200);
			});
		}
	});

	test('sampled routes have security headers', async ({ request }) => {
		const { all } = await sampleRoutes(BASE_URL);

		for (const route of all.slice(0, 5)) {
			await test.step(`headers on ${route}`, async () => {
				const resp = await request.get(route);
				const h = resp.headers();
				expect(h['x-content-type-options']).toBe('nosniff');
				expect(h['x-frame-options']).toBe('DENY');
			});
		}
	});
});
