import { test, expect } from '@playwright/test';

test.describe('useDroidEvents Hook', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/events');
		await page
			.getByTestId('event-hook-test')
			.waitFor({ state: 'visible', timeout: 10_000 });
		// Wait for droid init (emits auto droid-ready) then clear
		await page.waitForFunction(() => !!(window as any).kbve?.api, {
			timeout: 10_000,
		});
		await page.getByTestId('clear-logs').click();
		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'0',
		);
	});

	test('starts with no events captured', async ({ page }) => {
		await expect(page.getByTestId('no-events')).toBeVisible();
		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'0',
		);
	});

	test('captures droid-ready event via useDroidEvents', async ({ page }) => {
		await page.getByTestId('emit-ready').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'1',
		);

		const entry = page.getByTestId('event-entry-0');
		await expect(entry).toHaveAttribute('data-event', 'droid-ready');
		await expect(entry).toContainText('droid-ready');
		await expect(entry).toContainText('timestamp');
	});

	test('captures panel-open event with correct payload', async ({ page }) => {
		await page.getByTestId('emit-panel-open').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'1',
		);

		const entry = page.getByTestId('event-entry-0');
		await expect(entry).toHaveAttribute('data-event', 'panel-open');
		await expect(entry).toContainText('"id":"right"');
	});

	test('captures panel-close event with correct payload', async ({
		page,
	}) => {
		await page.getByTestId('emit-panel-close').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'1',
		);

		const entry = page.getByTestId('event-entry-0');
		await expect(entry).toHaveAttribute('data-event', 'panel-close');
		await expect(entry).toContainText('"id":"right"');
	});

	test('captures multiple events in order', async ({ page }) => {
		await page.getByTestId('emit-ready').click();
		await page.getByTestId('emit-panel-open').click();
		await page.getByTestId('emit-panel-close').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'3',
		);

		await expect(page.getByTestId('event-entry-0')).toHaveAttribute(
			'data-event',
			'droid-ready',
		);
		await expect(page.getByTestId('event-entry-1')).toHaveAttribute(
			'data-event',
			'panel-open',
		);
		await expect(page.getByTestId('event-entry-2')).toHaveAttribute(
			'data-event',
			'panel-close',
		);
	});

	test('clear logs removes all entries', async ({ page }) => {
		await page.getByTestId('emit-ready').click();
		await page.getByTestId('emit-panel-open').click();
		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'2',
		);

		await page.getByTestId('clear-logs').click();

		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'0',
		);
		await expect(page.getByTestId('no-events')).toBeVisible();
	});

	test('hook cleans up subscriptions on navigation', async ({ page }) => {
		await page.getByTestId('emit-ready').click();
		await page.getByTestId('emit-panel-open').click();
		await page.getByTestId('emit-panel-close').click();
		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'3',
		);

		await page.getByTestId('nav-home').click();
		await page.getByTestId('menu-view').waitFor({ state: 'visible' });

		await page.getByTestId('nav-events').click();
		await page
			.getByTestId('event-hook-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Old manually-emitted events should be gone after navigation.
		// droid-ready may fire on re-init, so count could be 0 or 1.
		const count = await page
			.getByTestId('event-log')
			.getAttribute('data-count');
		expect(Number(count)).toBeLessThanOrEqual(1);

		// If droid-ready auto-fired, verify it's a fresh init event, not an old one
		if (count === '1') {
			await expect(page.getByTestId('event-entry-0')).toHaveAttribute(
				'data-event',
				'droid-ready',
			);
		}
	});
});
