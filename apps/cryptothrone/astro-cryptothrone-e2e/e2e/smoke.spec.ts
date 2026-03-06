import { test, expect } from '@playwright/test';
import { CONTENT_ROUTES, GAME_ROUTES } from './helpers/routes';

test.describe('astro-cryptothrone smoke tests', () => {
	test('homepage loads with 200', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.status()).toBe(200);
	});

	test('homepage has correct title', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/CryptoThrone/);
	});

	test('homepage hero has Play Now link', async ({ page }) => {
		await page.goto('/');
		const playLink = page.locator('a[href="/game/play/"]').first();
		await expect(playLink).toBeVisible();
	});

	for (const route of CONTENT_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	for (const route of GAME_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}
});

test.describe('sidebar navigation', () => {
	test('sidebar contains Game section with Play link', async ({ page }) => {
		await page.goto('/guides/getting-started/');
		const sidebar = page.locator('nav[aria-label="Main"]');
		await expect(sidebar).toBeAttached();
		await expect(sidebar.locator('a[href="/game/play/"]')).toBeAttached();
	});

	test('sidebar contains Guides section', async ({ page }) => {
		await page.goto('/guides/getting-started/');
		const sidebar = page.locator('nav[aria-label="Main"]');
		await expect(
			sidebar.locator('a[href="/guides/getting-started/"]'),
		).toBeAttached();
	});
});

test.describe('search integration', () => {
	test('search button is present', async ({ page }) => {
		await page.goto('/');
		const trigger = page.locator('button[data-open-modal]');
		await expect(trigger).toBeVisible({ timeout: 10_000 });
	});
});
