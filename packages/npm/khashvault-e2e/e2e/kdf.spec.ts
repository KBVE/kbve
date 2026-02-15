import { test, expect } from '@playwright/test';

test.describe('KDF operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.click('[data-testid="nav-kdf"]');
	});

	test('should derive a CryptoKey from password', async ({ page }) => {
		await page.click('[data-testid="kdf-run-derive"]');

		await expect(
			page.locator('[data-testid="kdf-key-derived"]'),
		).toBeVisible({ timeout: 10_000 });
		await expect(
			page.locator('[data-testid="kdf-key-derived"]'),
		).toHaveText('Key Derived');
		await expect(
			page.locator('[data-testid="kdf-error"]'),
		).not.toBeVisible();
	});

	test('should derive raw bits with correct byte length', async ({
		page,
	}) => {
		await page.click('[data-testid="kdf-run-bits"]');

		await expect(
			page.locator('[data-testid="kdf-bits-length"]'),
		).toHaveText('32', { timeout: 10_000 });
		await expect(
			page.locator('[data-testid="kdf-error"]'),
		).not.toBeVisible();
	});
});
