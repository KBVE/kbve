import { test, expect } from '@playwright/test';

test.describe('Toast: Queue Drain (race condition fix)', () => {
	test('toast queued before island mount is displayed', async ({ page }) => {
		// Seed the window-level queue BEFORE the page runs any JS,
		// simulating DroidProvider calling addToast() before ToastContainer mounts.
		await page.addInitScript(() => {
			(window as any).__kbveToastQueue = [
				{
					id: 'e2e-race-test',
					message: 'Race condition toast',
					severity: 'info',
					duration: 30_000,
				},
			];
		});

		await page.goto('/');

		const toast = page.locator('role=alert', {
			hasText: 'Race condition toast',
		});
		await expect(toast).toBeVisible({ timeout: 15_000 });
	});

	test('multiple queued toasts are all drained', async ({ page }) => {
		await page.addInitScript(() => {
			(window as any).__kbveToastQueue = [
				{
					id: 'e2e-drain-1',
					message: 'First queued',
					severity: 'info',
					duration: 30_000,
				},
				{
					id: 'e2e-drain-2',
					message: 'Second queued',
					severity: 'success',
					duration: 30_000,
				},
			];
		});

		await page.goto('/');

		await expect(
			page.locator('role=alert', { hasText: 'First queued' }),
		).toBeVisible({ timeout: 15_000 });
		await expect(
			page.locator('role=alert', { hasText: 'Second queued' }),
		).toBeVisible({ timeout: 15_000 });
	});

	test('queue is cleared after drain', async ({ page }) => {
		await page.addInitScript(() => {
			(window as any).__kbveToastQueue = [
				{
					id: 'e2e-clear-test',
					message: 'Should clear',
					severity: 'info',
					duration: 30_000,
				},
			];
		});

		await page.goto('/');

		// Wait for the toast to appear (confirms drain happened)
		await expect(
			page.locator('role=alert', { hasText: 'Should clear' }),
		).toBeVisible({ timeout: 15_000 });

		// Queue should be empty or null (drained) after mount
		const queueLength = await page.evaluate(
			() => (window as any).__kbveToastQueue?.length ?? 0,
		);
		expect(queueLength).toBe(0);
	});
});
