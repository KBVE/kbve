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

	test('homepage HTML revalidates (no-cache, not long-lived)', async ({
		request,
	}) => {
		const res = await request.get('/');
		expect(res.status()).toBe(200);
		// HTML must revalidate so a redeploy is picked up immediately; only the
		// content-hashed /_astro/ assets are long-cached.
		const cc = res.headers()['cache-control'] ?? '';
		expect(cc).toContain('no-cache');
		expect(cc).not.toContain('max-age');
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

	test('serves a 404 page for unknown routes', async ({ request }) => {
		const res = await request.get('/definitely-not-a-real-page');
		expect(res.status()).toBe(404);
		// A 404 must never be CDN-cached, or a not-yet-deployed asset 404 sticks.
		expect(res.headers()['cache-control'] ?? '').toContain('no-store');
		const body = await res.text();
		expect(body).toMatch(/404|not found/i);
	});

	test('sitemap is generated in the production build', async ({
		request,
	}) => {
		const res = await request.get('/sitemap-index.xml');
		expect(res.status()).toBe(200);
		expect(await res.text()).toMatch(/sitemapindex|urlset/);
	});
});
