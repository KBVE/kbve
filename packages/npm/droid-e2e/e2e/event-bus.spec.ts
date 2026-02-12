import { test, expect } from '@playwright/test';

test.describe('Event Bus', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('nav-events').click();
		await page.getByTestId('event-bus-test').waitFor({ state: 'visible' });
	});

	test('starts with no events', async ({ page }) => {
		await expect(page.getByTestId('no-events')).toBeVisible();
		await expect(page.getByTestId('event-log')).toHaveAttribute('data-count', '0');
	});

	test('emitting droid-ready fires and is captured', async ({ page }) => {
		await page.getByTestId('emit-ready').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute('data-count', '1');

		const entry = page.getByTestId('event-entry-0');
		await expect(entry).toHaveAttribute('data-event', 'droid-ready');
		await expect(entry).toContainText('droid-ready');
	});

	test('multiple events are logged in order', async ({ page }) => {
		await page.getByTestId('emit-ready').click();
		await page.getByTestId('emit-ready').click();
		await page.getByTestId('emit-ready').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute('data-count', '3');

		for (let i = 0; i < 3; i++) {
			await expect(page.getByTestId(`event-entry-${i}`)).toHaveAttribute('data-event', 'droid-ready');
		}
	});

	test('clear logs removes all entries', async ({ page }) => {
		await page.getByTestId('emit-ready').click();
		await expect(page.getByTestId('event-log')).toHaveAttribute('data-count', '1');

		await page.getByTestId('clear-logs').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute('data-count', '0');
		await expect(page.getByTestId('no-events')).toBeVisible();
	});
});
