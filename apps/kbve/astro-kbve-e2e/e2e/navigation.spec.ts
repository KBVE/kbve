import { test, expect } from '@playwright/test';
import { CONTENT_ROUTES, AUTH_ROUTES, DATA_ROUTES } from './helpers/routes';

test.describe('route coverage', () => {
	for (const route of CONTENT_ROUTES) {
		test(`${route.label} (${route.path}) returns 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	for (const route of AUTH_ROUTES) {
		test(`${route.label} (${route.path}) returns 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	for (const route of DATA_ROUTES) {
		test(`${route.label} (${route.path}) returns 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}
});

test.describe('sidebar navigation', () => {
	test('sidebar contains Guides link', async ({ page }) => {
		await page.goto('/guides/');
		const sidebar = page.locator('nav[aria-label="Main"]');
		await expect(sidebar.getByText('Guides')).toBeVisible();
	});

	test('sidebar contains Applications link', async ({ page }) => {
		await page.goto('/application/');
		const sidebar = page.locator('nav[aria-label="Main"]');
		await expect(sidebar.getByText('Applications')).toBeVisible();
	});

	test('sidebar link navigates correctly', async ({ page }) => {
		await page.goto('/guides/');
		const link = page.locator(
			'nav[aria-label="Main"] a[href*="/guides/getting-started/"]',
		);
		if ((await link.count()) > 0) {
			await link.first().click();
			await page.waitForURL('**/guides/getting-started/**');
			expect(page.url()).toContain('/guides/getting-started/');
		}
	});
});
