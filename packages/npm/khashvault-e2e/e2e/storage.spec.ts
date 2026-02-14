import { test, expect } from '@playwright/test';

test.describe('SecureLocalStorage operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.click('[data-testid="nav-storage"]');
	});

	test('should store and retrieve encrypted data from localStorage', async ({
		page,
	}) => {
		await page.click('[data-testid="storage-run-roundtrip"]');

		await expect(
			page.locator('[data-testid="storage-store-result"]'),
		).toHaveText('stored', { timeout: 10_000 });
		await expect(
			page.locator('[data-testid="storage-retrieve-result"]'),
		).toHaveText('Stored secret value', { timeout: 10_000 });
		await expect(
			page.locator('[data-testid="storage-error"]'),
		).not.toBeVisible();
	});
});
