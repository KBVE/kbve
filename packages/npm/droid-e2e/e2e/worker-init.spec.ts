import { test, expect } from '@playwright/test';

test.describe('Worker Initialization', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('nav-workers').click();
		await page.getByTestId('worker-test').waitFor({ state: 'visible' });
	});

	test('droid initializes without console errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		// Wait for initialization to complete
		await expect(page.getByTestId('worker-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{
				timeout: 10_000,
			},
		);

		// Filter out expected warnings (e.g., missing Supabase config)
		const criticalErrors = errors.filter(
			(e) => !e.includes('supabase') && !e.includes('SUPABASE'),
		);
		expect(criticalErrors).toHaveLength(0);
	});

	test('event bus is available after init', async ({ page }) => {
		await expect(page.getByTestId('worker-has-events')).toHaveAttribute(
			'data-value',
			'true',
			{
				timeout: 10_000,
			},
		);
	});

	test('uiux system is available after init', async ({ page }) => {
		await expect(page.getByTestId('worker-has-uiux')).toHaveAttribute(
			'data-value',
			'true',
			{
				timeout: 10_000,
			},
		);
	});

	test('no worker error is displayed', async ({ page }) => {
		// Wait for init to settle
		await expect(page.getByTestId('worker-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{
				timeout: 10_000,
			},
		);

		// Verify no error element is visible
		await expect(page.getByTestId('worker-error')).not.toBeVisible();
	});

	test('API worker is available after init', async ({ page }) => {
		await expect(page.getByTestId('worker-has-api')).toHaveAttribute(
			'data-value',
			'true',
			{
				timeout: 10_000,
			},
		);
	});

	test('WebSocket worker is available after init', async ({ page }) => {
		await expect(page.getByTestId('worker-has-ws')).toHaveAttribute(
			'data-value',
			'true',
			{
				timeout: 10_000,
			},
		);
	});

	test('all workers initialize simultaneously', async ({ page }) => {
		// All subsystems should be ready once initialized is true
		await expect(page.getByTestId('worker-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{
				timeout: 10_000,
			},
		);

		// Verify all subsystems are available
		await expect(page.getByTestId('worker-has-api')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(page.getByTestId('worker-has-uiux')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(page.getByTestId('worker-has-ws')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(page.getByTestId('worker-has-events')).toHaveAttribute(
			'data-value',
			'true',
		);
	});
});
