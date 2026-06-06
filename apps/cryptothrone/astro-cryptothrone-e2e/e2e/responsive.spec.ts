import { test, expect } from '@playwright/test';
import { isMobileViewport } from './helpers/env';
import { ALL_ROUTES } from './helpers/routes';

test.describe('mobile layout', () => {
	test.beforeEach(async ({ page }) => {
		test.skip(!(await isMobileViewport(page)), 'mobile-only assertions');
	});

	test('homepage hero is visible and fits the viewport width', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page.locator('.ct-hero__title')).toBeVisible();
		const overflow = await page.evaluate(() => {
			const doc = document.documentElement;
			return doc.scrollWidth - doc.clientWidth;
		});
		expect(overflow).toBeLessThanOrEqual(2);
	});

	test('desktop nav is collapsed on mobile', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('nav.ct-nav')).toBeHidden();
	});

	test('mobile exposes a menu button and reachable sidebar nav', async ({
		page,
	}) => {
		await page.goto('/guides/getting-started/');
		await expect(
			page.locator('button[aria-controls="starlight__sidebar"]'),
		).toBeVisible();
		const sidebar = page.locator('nav[aria-label="Main"]');
		await expect(sidebar.locator('a[href="/game/play/"]')).toBeAttached();
		await expect(
			sidebar.locator('a[href="/guides/getting-started/"]'),
		).toBeAttached();
	});

	for (const route of ALL_ROUTES) {
		test(`${route.label} has no horizontal overflow on mobile`, async ({
			page,
		}) => {
			await page.goto(route.path);
			const overflow = await page.evaluate(() => {
				const doc = document.documentElement;
				return doc.scrollWidth - doc.clientWidth;
			});
			expect(overflow).toBeLessThanOrEqual(2);
		});
	}
});
