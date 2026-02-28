import { test, expect } from '@playwright/test';

test.describe('astro-kbve smoke tests', () => {
	test('homepage loads with 200', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.status()).toBe(200);
	});

	test('homepage has correct title', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/KBVE/);
	});

	test('guides page loads', async ({ page }) => {
		const response = await page.goto('/guides/');
		expect(response?.status()).toBe(200);
	});
});
