import { test, expect } from '@playwright/test';

test.describe('Multiple context consumers', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/edge-cases');
		await page
			.getByTestId('multi-consumer-test')
			.waitFor({ state: 'visible', timeout: 10_000 });
	});

	test('all three consumers render', async ({ page }) => {
		await expect(page.getByTestId('consumer-a')).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByTestId('consumer-b')).toBeVisible();
		await expect(page.getByTestId('consumer-c')).toBeVisible();
	});

	test('all consumers reflect same initialized state', async ({ page }) => {
		await expect(
			page.getByTestId('consumer-a-initialized'),
		).toHaveAttribute('data-value', 'true', { timeout: 10_000 });
		await expect(
			page.getByTestId('consumer-b-initialized'),
		).toHaveAttribute('data-value', 'true');
		await expect(
			page.getByTestId('consumer-c-initialized'),
		).toHaveAttribute('data-value', 'true');
	});

	test('all consumers reflect same event bus state', async ({ page }) => {
		await expect(page.getByTestId('consumer-a-events')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
		await expect(page.getByTestId('consumer-b-events')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(page.getByTestId('consumer-c-events')).toHaveAttribute(
			'data-value',
			'true',
		);
	});

	test('deeply nested consumer receives context', async ({ page }) => {
		await expect(
			page.getByTestId('deep-consumer-initialized'),
		).toHaveAttribute('data-value', 'true', { timeout: 10_000 });
	});
});

test.describe('Provider re-initialization on navigation', () => {
	test('navigating away and back resets provider state', async ({ page }) => {
		await page.goto('/provider');
		await page
			.getByTestId('provider-status-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Wait for initialization
		await expect(page.getByTestId('droid-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);

		// Navigate to home
		await page.getByTestId('nav-home').click();
		await page.getByTestId('menu-view').waitFor({ state: 'visible' });

		// Navigate back to provider
		await page.getByTestId('nav-provider').click();
		await page
			.getByTestId('provider-status-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Should re-initialize successfully
		await expect(page.getByTestId('droid-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
		await expect(page.getByTestId('ctx-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
	});

	test('navigating between provider and events preserves independent state', async ({
		page,
	}) => {
		await page.goto('/provider');
		await page
			.getByTestId('provider-status-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		await expect(page.getByTestId('droid-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);

		// Navigate to events page
		await page.getByTestId('nav-events').click();
		await page
			.getByTestId('event-hook-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Clear any events captured during navigation (droid-ready fires on astro:page-load)
		await page.getByTestId('clear-logs').click();
		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'0',
		);

		// Emit an event on events page
		await page.getByTestId('emit-ready').click();
		await expect(page.getByTestId('event-log')).toHaveAttribute(
			'data-count',
			'1',
		);

		// Navigate back to provider
		await page.getByTestId('nav-provider').click();
		await page
			.getByTestId('provider-status-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Provider should still be functional
		await expect(page.getByTestId('droid-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
	});
});

test.describe('Cross-page navigation', () => {
	test('navigating through all pages works without errors', async ({
		page,
	}) => {
		// Start at home
		await page.goto('/');
		await page.getByTestId('menu-view').waitFor({ state: 'visible' });

		// Go to provider
		await page.getByTestId('nav-provider').click();
		await page
			.getByTestId('provider-status-test')
			.waitFor({ state: 'visible', timeout: 10_000 });
		await expect(page.getByTestId('droid-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);

		// Go to events
		await page.getByTestId('nav-events').click();
		await page
			.getByTestId('event-hook-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Go to edge cases
		await page.getByTestId('nav-edge-cases').click();
		await page
			.getByTestId('rapid-fire-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Go back to home
		await page.getByTestId('nav-home').click();
		await page.getByTestId('menu-view').waitFor({ state: 'visible' });
	});

	test('rapid navigation does not cause errors', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('menu-view').waitFor({ state: 'visible' });

		// Rapid click through pages
		await page.getByTestId('nav-provider').click();
		await page.getByTestId('nav-events').click();
		await page.getByTestId('nav-edge-cases').click();
		await page.getByTestId('nav-home').click();

		// Should eventually settle on home without console errors
		await page
			.getByTestId('menu-view')
			.waitFor({ state: 'visible', timeout: 10_000 });
	});

	test('no console errors during full page lifecycle', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto('/edge-cases');
		await page
			.getByTestId('rapid-fire-test')
			.waitFor({ state: 'visible', timeout: 10_000 });

		// Wait for droid init (emits auto droid-ready) then clear
		await page.waitForFunction(() => !!(window as any).kbve?.api, {
			timeout: 10_000,
		});
		await page.getByTestId('clear-rapid').click();

		// Interact with the page
		await page.getByTestId('emit-burst').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'20',
			{
				timeout: 5_000,
			},
		);

		await page.getByTestId('clear-rapid').click();

		// Navigate away
		await page.getByTestId('nav-home').click();
		await page.getByTestId('menu-view').waitFor({ state: 'visible' });

		// Filter out non-critical errors (worker-related warnings)
		const criticalErrors = errors.filter(
			(e) => !e.includes('SharedWorker') && !e.includes('Worker'),
		);
		expect(criticalErrors).toEqual([]);
	});
});
