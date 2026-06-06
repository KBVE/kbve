import { test, expect } from '@playwright/test';
import { ALL_ROUTES, CONTENT_ROUTES } from './helpers/routes';

test.describe('accessibility baseline', () => {
	for (const route of ALL_ROUTES) {
		test(`${route.label} declares lang and a navigation landmark`, async ({
			page,
		}) => {
			await page.goto(route.path);
			await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
			expect(
				await page.locator('nav[aria-label]').count(),
			).toBeGreaterThan(0);
		});

		test(`${route.label} has no images missing alt text`, async ({
			page,
		}) => {
			await page.goto(route.path);
			const missing = await page.evaluate(
				() => document.querySelectorAll('img:not([alt])').length,
			);
			expect(missing).toBe(0);
		});
	}

	for (const route of CONTENT_ROUTES) {
		test(`${route.label} exposes a level-1 heading`, async ({ page }) => {
			await page.goto(route.path);
			await expect(page.locator('h1').first()).toBeVisible();
		});
	}

	test('content pages provide a skip-to-content affordance', async ({
		page,
	}) => {
		await page.goto('/guides/getting-started/');
		await expect(
			page.locator('a', { hasText: /skip to content/i }).first(),
		).toBeAttached();
	});
});
