import { test, expect } from '@playwright/test';

test.describe('R3F Stage', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.click('[data-testid="nav-r3f"]');
	});

	test('should render the R3F container', async ({ page }) => {
		await expect(page.locator('[data-testid="r3f-container"]')).toBeVisible();
	});

	test('should create a WebGL canvas', async ({ page }) => {
		const canvas = page.locator('[data-testid="r3f-container"] canvas');
		await expect(canvas).toBeVisible({ timeout: 10_000 });
	});
});
