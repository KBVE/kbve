import { test, expect } from '@playwright/test';

test.describe('AES-GCM operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.click('[data-testid="nav-aes"]');
	});

	test('should generate key and roundtrip encrypt/decrypt', async ({
		page,
	}) => {
		await page.click('[data-testid="aes-run-roundtrip"]');

		await expect(
			page.locator('[data-testid="aes-key-generated"]'),
		).toBeVisible({ timeout: 10_000 });
		await expect(
			page.locator('[data-testid="aes-roundtrip-result"]'),
		).toHaveText('KhashVault E2E test message', { timeout: 10_000 });
		await expect(
			page.locator('[data-testid="aes-error"]'),
		).not.toBeVisible();
	});

	test('should encrypt/decrypt with password', async ({ page }) => {
		await page.click('[data-testid="aes-run-password"]');

		await expect(
			page.locator('[data-testid="aes-password-result"]'),
		).toHaveText('Password-encrypted secret', { timeout: 15_000 });
		await expect(
			page.locator('[data-testid="aes-error"]'),
		).not.toBeVisible();
	});
});
