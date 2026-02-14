import { test, expect } from '@playwright/test';

test.describe('PGP operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.click('[data-testid="nav-pgp"]');
	});

	test('should generate PGP keys and roundtrip encrypt/decrypt', async ({
		page,
	}) => {
		await page.click('[data-testid="pgp-run-roundtrip"]');

		await expect(
			page.locator('[data-testid="pgp-key-generated"]'),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			page.locator('[data-testid="pgp-roundtrip-result"]'),
		).toHaveText('PGP E2E test message', { timeout: 30_000 });
		await expect(
			page.locator('[data-testid="pgp-error"]'),
		).not.toBeVisible();
	});
});
