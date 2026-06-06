import { test, expect } from '@playwright/test';

/**
 * axum-cryptothrone server behaviour layered on top of the static SSG:
 * security headers, cache-control, and the askama 404 fallback. Docker-only.
 */
test.describe('axum server integration', () => {
	test.beforeEach(() => {
		test.skip(
			test.info().project.name !== 'docker',
			'server middleware only present in the axum build',
		);
	});

	test('applies security headers to responses', async ({ request }) => {
		const res = await request.get('/');
		const headers = res.headers();
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['referrer-policy']).toBe(
			'strict-origin-when-cross-origin',
		);
	});

	test('serves the homepage with a cache-control header', async ({
		request,
	}) => {
		const res = await request.get('/');
		expect(res.status()).toBe(200);
		expect(res.headers()['cache-control']).toContain('max-age');
	});

	test('immutable cache for hashed _astro assets', async ({
		page,
		request,
	}) => {
		await page.goto('/');
		const assetHref = await page
			.locator('link[href*="/_astro/"], script[src*="/_astro/"]')
			.first()
			.evaluate(
				(el) => el.getAttribute('href') ?? el.getAttribute('src') ?? '',
			)
			.catch(() => '');
		test.skip(!assetHref, 'no hashed _astro asset on the page');
		const res = await request.get(assetHref);
		expect(res.status()).toBe(200);
		expect(res.headers()['cache-control']).toContain('immutable');
	});

	test('askama 404 fallback for unknown routes', async ({ request }) => {
		const res = await request.get('/definitely-not-a-real-page');
		expect(res.status()).toBe(404);
		const body = await res.text();
		expect(body).toContain('Page Not Found');
	});

	test('sitemap is generated in the production build', async ({
		request,
	}) => {
		const res = await request.get('/sitemap-index.xml');
		expect(res.status()).toBe(200);
		expect(await res.text()).toMatch(/sitemapindex|urlset/);
	});
});
