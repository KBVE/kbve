import { test, expect } from '@playwright/test';

test.describe('Integration: Phaser + R3F coexistence', () => {
	test('should render both Phaser and R3F on the same page', async ({
		page,
	}) => {
		await page.goto('/');
		await page.click('[data-testid="nav-both"]');

		const phaserCanvas = page.locator(
			'[data-testid="phaser-container"] canvas',
		);
		const r3fCanvas = page.locator('[data-testid="r3f-container"] canvas');

		await expect(phaserCanvas).toBeVisible({ timeout: 10_000 });
		await expect(r3fCanvas).toBeVisible({ timeout: 10_000 });
	});

	test('should navigate between views without errors', async ({ page }) => {
		await page.goto('/');

		await page.click('[data-testid="nav-phaser"]');
		await expect(
			page.locator('[data-testid="phaser-container"]'),
		).toBeVisible();

		await page.click('[data-testid="nav-r3f"]');
		await expect(page.locator('[data-testid="r3f-container"]')).toBeVisible();

		await page.click('[data-testid="nav-menu"]');
		await expect(page.locator('[data-testid="menu-text"]')).toBeVisible();
	});
});
