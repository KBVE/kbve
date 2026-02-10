import { test, expect } from '@playwright/test';

test.describe('PhaserGame', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.click('[data-testid="nav-phaser"]');
	});

	test('should render the phaser container', async ({ page }) => {
		await expect(page.locator('[data-testid="phaser-container"]')).toBeVisible();
	});

	test('should create a canvas element', async ({ page }) => {
		const canvas = page.locator('[data-testid="phaser-container"] canvas');
		await expect(canvas).toBeVisible({ timeout: 10_000 });
	});

	test('should signal game ready', async ({ page }) => {
		await expect(page.locator('[data-testid="phaser-ready"]')).toBeVisible({
			timeout: 10_000,
		});
	});
});
