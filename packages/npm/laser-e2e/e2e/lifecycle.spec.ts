import { test, expect } from '@playwright/test';

test.describe('Lifecycle: mount/unmount/remount', () => {
	test('should clean up Phaser canvas when navigating away', async ({
		page,
	}) => {
		await page.goto('/');
		await page.click('[data-testid="nav-phaser"]');

		const canvas = page.locator('[data-testid="phaser-container"] canvas');
		await expect(canvas).toBeVisible({ timeout: 10_000 });

		// Navigate away
		await page.click('[data-testid="nav-menu"]');
		await expect(page.locator('[data-testid="menu-text"]')).toBeVisible();

		// Phaser container should no longer exist
		await expect(
			page.locator('[data-testid="phaser-container"]'),
		).not.toBeVisible();
	});

	test('should clean up R3F canvas when navigating away', async ({
		page,
	}) => {
		await page.goto('/');
		await page.click('[data-testid="nav-r3f"]');

		const canvas = page.locator('[data-testid="r3f-container"] canvas');
		await expect(canvas).toBeVisible({ timeout: 10_000 });

		// Navigate away
		await page.click('[data-testid="nav-menu"]');
		await expect(page.locator('[data-testid="menu-text"]')).toBeVisible();

		// R3F container should no longer exist
		await expect(
			page.locator('[data-testid="r3f-container"]'),
		).not.toBeVisible();
	});

	test('should remount Phaser cleanly after navigating back', async ({
		page,
	}) => {
		await page.goto('/');

		// Mount Phaser
		await page.click('[data-testid="nav-phaser"]');
		await expect(
			page.locator('[data-testid="phaser-container"] canvas'),
		).toBeVisible({ timeout: 10_000 });

		// Navigate away
		await page.click('[data-testid="nav-menu"]');
		await expect(page.locator('[data-testid="menu-text"]')).toBeVisible();

		// Remount Phaser
		await page.click('[data-testid="nav-phaser"]');
		await expect(
			page.locator('[data-testid="phaser-container"] canvas'),
		).toBeVisible({ timeout: 10_000 });

		// Should signal ready again
		await expect(page.locator('[data-testid="phaser-ready"]')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should have no console errors during navigation cycle', async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto('/');
		await page.click('[data-testid="nav-phaser"]');
		await expect(page.locator('[data-testid="phaser-ready"]')).toBeVisible({
			timeout: 10_000,
		});

		await page.click('[data-testid="nav-r3f"]');
		await expect(
			page.locator('[data-testid="r3f-container"] canvas'),
		).toBeVisible({ timeout: 10_000 });

		await page.click('[data-testid="nav-both"]');
		await expect(
			page.locator('[data-testid="phaser-container"] canvas'),
		).toBeVisible({ timeout: 10_000 });

		await page.click('[data-testid="nav-menu"]');
		await expect(page.locator('[data-testid="menu-text"]')).toBeVisible();

		expect(errors).toHaveLength(0);
	});
});
