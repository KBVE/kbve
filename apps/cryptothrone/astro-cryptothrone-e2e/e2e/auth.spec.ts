import { test, expect } from '@playwright/test';
import { AUTH_ROUTES } from './helpers/routes';

test.describe('astro-cryptothrone auth pages', () => {
	for (const route of AUTH_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	test('login page renders GitHub and Discord OAuth buttons', async ({
		page,
	}) => {
		await page.goto('/auth/login/');
		await expect(page.getByRole('button', { name: /GitHub/i })).toBeVisible(
			{ timeout: 10_000 },
		);
		await expect(
			page.getByRole('button', { name: /Discord/i }),
		).toBeVisible({ timeout: 10_000 });
	});

	test('login page is excluded from indexing', async ({ page }) => {
		await page.goto('/auth/login/');
		const robots = page.locator('meta[name="robots"]');
		await expect(robots).toHaveAttribute('content', /noindex/);
	});
});
