import { test, expect } from '@playwright/test';

test.describe('tower defense smoke', () => {
	test('arcade page loads and mounts a canvas', async ({ page }) => {
		await page.goto('/arcade/towerdefense/', { waitUntil: 'load' });
		const canvas = page.locator('canvas');
		await expect(canvas.first()).toBeVisible({ timeout: 30_000 });
		const box = await canvas.first().boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);
	});

	test('redirect from misspelled /towerdefence works', async ({ page }) => {
		const res = await page.goto('/arcade/towerdefence/', {
			waitUntil: 'load',
		});
		expect(res?.url()).toContain('/arcade/towerdefense/');
	});
});
