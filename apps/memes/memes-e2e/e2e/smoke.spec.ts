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

test.describe('Smoke: Feed Page', () => {
	test('feed page loads with 200', async ({ page }) => {
		const response = await page.goto('/feed');
		expect(response).not.toBeNull();
		expect(response!.status()).toBe(200);
	});

	test('feed page contains React mount point', async ({ page }) => {
		await page.goto('/feed');
		await page.waitForLoadState('domcontentloaded');
		const html = await page.content();
		expect(html).toContain('astro-island');
	});
});

test.describe('Smoke: Profile Page', () => {
	test('profile page loads with 200', async ({ page }) => {
		const response = await page.goto('/profile');
		expect(response).not.toBeNull();
		expect(response!.status()).toBe(200);
	});

	test('profile page contains React mount point', async ({ page }) => {
		await page.goto('/profile');
		await page.waitForLoadState('domcontentloaded');
		const html = await page.content();
		expect(html).toContain('astro-island');
	});
});

test.describe('Smoke: Footer', () => {
	test('footer renders with legal links', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');

		const footer = page.locator('footer').last();
		await expect(footer).toBeVisible({ timeout: 5_000 });

		const footerText = await footer.textContent();
		expect(footerText).toContain('KBVE');
		expect(footerText).toContain('Privacy');
		expect(footerText).toContain('Terms');
	});

	test('footer social links are present', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');

		const footer = page.locator('footer').last();
		const githubLink = footer.locator('a[aria-label="GitHub"]');
		const discordLink = footer.locator('a[aria-label="Discord"]');

		await expect(githubLink).toBeVisible({ timeout: 5_000 });
		await expect(discordLink).toBeVisible({ timeout: 5_000 });
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
