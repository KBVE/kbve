import { test, expect } from '@playwright/test';

// This test requires the full production stack (workers + Supabase gateway).
// Run via the Docker playwright config: e2e:docker target.

test.describe('Toast: Welcome Toast', () => {
	test('welcome toast appears on page load', async ({ page }) => {
		await page.goto('/');

		// Wait for droid to initialize (workers must be served by the container)
		await page.waitForFunction(() => !!(window as any).kbve?.events, null, {
			timeout: 20_000,
		});

		// The welcome toast fires as "Welcome!" (anon) or "Welcome back, {name}" (auth).
		// ToastContainer renders each toast inside a role="alert" element.
		const toast = page.locator('role=alert').first();
		await expect(toast).toBeVisible({ timeout: 15_000 });
		await expect(toast).toContainText(/Welcome/);
	});

	test('welcome toast auto-dismisses', async ({ page }) => {
		await page.goto('/');

		await page.waitForFunction(() => !!(window as any).kbve?.events, null, {
			timeout: 20_000,
		});

		const toast = page.locator('role=alert').first();
		await expect(toast).toBeVisible({ timeout: 15_000 });

		// The welcome toast duration is 3000–4000ms plus 200ms transition.
		await expect(toast).not.toBeVisible({ timeout: 6_000 });
	});
});
