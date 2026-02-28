import { test, expect } from '@playwright/test';

test.describe('auth page rendering', () => {
	test('login page renders auth component', async ({ page }) => {
		await page.goto('/login/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('register page renders auth component', async ({ page }) => {
		await page.goto('/register/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('logout page renders', async ({ page }) => {
		await page.goto('/logout/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('settings page renders', async ({ page }) => {
		await page.goto('/settings/');
		const body = page.locator('body');
		await expect(body).toBeVisible();
	});
});
