import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('should render app root and menu', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
		await expect(page.locator('[data-testid="menu-text"]')).toBeVisible();
	});

	test('should navigate between all test views without errors', async ({
		page,
	}) => {
		await page.goto('/');

		const views = ['hash', 'aes', 'kdf', 'pgp', 'storage'] as const;
		for (const view of views) {
			await page.click(`[data-testid="nav-${view}"]`);
			await expect(
				page.locator(`[data-testid="${view}-container"]`),
			).toBeVisible();
		}

		await page.click('[data-testid="nav-menu"]');
		await expect(page.locator('[data-testid="menu-text"]')).toBeVisible();
	});
});
