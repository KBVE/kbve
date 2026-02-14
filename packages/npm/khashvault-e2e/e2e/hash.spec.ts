import { test, expect } from '@playwright/test';

test.describe('Hash operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.click('[data-testid="nav-hash"]');
	});

	test('should compute correct SHA-256 of "hello"', async ({ page }) => {
		await page.click('[data-testid="hash-run-sha256"]');
		const result = page.locator('[data-testid="hash-sha256-result"]');
		await expect(result).toHaveText(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
			{ timeout: 5_000 },
		);
	});

	test('should compute SHA-512 of "hello" (non-empty)', async ({ page }) => {
		await page.click('[data-testid="hash-run-sha512"]');
		const result = page.locator('[data-testid="hash-sha512-result"]');
		await expect(result).not.toBeEmpty({ timeout: 5_000 });
		const text = await result.textContent();
		expect(text).toHaveLength(128);
	});

	test('should not show errors', async ({ page }) => {
		await page.click('[data-testid="hash-run-sha256"]');
		await expect(
			page.locator('[data-testid="hash-sha256-result"]'),
		).not.toBeEmpty({ timeout: 5_000 });
		await expect(
			page.locator('[data-testid="hash-error"]'),
		).not.toBeVisible();
	});
});
