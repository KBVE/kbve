import { test, expect } from '@playwright/test';

test.describe('Scale Management', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('nav-scale').click();
		await page.getByTestId('scale-test').waitFor({ state: 'visible' });
		// Wait for droid to fully initialize
		await expect(page.getByTestId('scale-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 15_000 },
		);
	});

	test('starts in full scale level', async ({ page }) => {
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'full',
		);
	});

	test('has overlay and canvas worker in full mode', async ({ page }) => {
		await expect(page.getByTestId('scale-has-overlay')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(
			page.getByTestId('scale-has-canvas-worker'),
		).toHaveAttribute('data-value', 'true');
	});

	test('DB and WS workers are active in full mode', async ({ page }) => {
		await expect(page.getByTestId('scale-has-ws')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(page.getByTestId('scale-has-api')).toHaveAttribute(
			'data-value',
			'true',
		);
	});

	test('downscale switches to minimal mode', async ({ page }) => {
		await page.getByTestId('scale-btn-downscale').click();

		// Wait for scale level to change
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);
	});

	test('downscale removes overlay and canvas worker', async ({ page }) => {
		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		await expect(page.getByTestId('scale-has-overlay')).toHaveAttribute(
			'data-value',
			'false',
		);
		await expect(
			page.getByTestId('scale-has-canvas-worker'),
		).toHaveAttribute('data-value', 'false');
	});

	test('downscale keeps DB and WS workers alive', async ({ page }) => {
		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		await expect(page.getByTestId('scale-has-ws')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(page.getByTestId('scale-has-api')).toHaveAttribute(
			'data-value',
			'true',
		);
	});

	test('downscale fires droid-downscale event', async ({ page }) => {
		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		await expect(page.getByTestId('scale-downscale-event')).toHaveAttribute(
			'data-value',
			'true',
		);
	});

	test('downscale is idempotent', async ({ page }) => {
		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		// Second downscale should not error
		await page.getByTestId('scale-btn-downscale').click();
		// Brief wait then verify still minimal and no error
		await page.waitForTimeout(500);
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
		);
		await expect(page.getByTestId('scale-error')).not.toBeVisible();
	});

	test('upscale restores full mode after downscale', async ({ page }) => {
		// Downscale first
		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		// Upscale
		await page.getByTestId('scale-btn-upscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'full',
			{ timeout: 5_000 },
		);
	});

	test('upscale restores overlay and canvas worker', async ({ page }) => {
		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		await page.getByTestId('scale-btn-upscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'full',
			{ timeout: 5_000 },
		);

		await expect(page.getByTestId('scale-has-overlay')).toHaveAttribute(
			'data-value',
			'true',
		);
		await expect(
			page.getByTestId('scale-has-canvas-worker'),
		).toHaveAttribute('data-value', 'true');
	});

	test('upscale fires droid-upscale event', async ({ page }) => {
		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		await page.getByTestId('scale-btn-upscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'full',
			{ timeout: 5_000 },
		);

		await expect(page.getByTestId('scale-upscale-event')).toHaveAttribute(
			'data-value',
			'true',
		);
	});

	test('upscale is idempotent when already full', async ({ page }) => {
		// Already in full mode — upscale should be a no-op
		await page.getByTestId('scale-btn-upscale').click();
		await page.waitForTimeout(500);
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'full',
		);
		await expect(page.getByTestId('scale-error')).not.toBeVisible();
	});

	test('no errors during full downscale/upscale cycle', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.getByTestId('scale-btn-downscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'minimal',
			{ timeout: 5_000 },
		);

		await page.getByTestId('scale-btn-upscale').click();
		await expect(page.getByTestId('scale-level')).toHaveAttribute(
			'data-value',
			'full',
			{ timeout: 5_000 },
		);

		await expect(page.getByTestId('scale-error')).not.toBeVisible();
		expect(errors).toHaveLength(0);
	});
});
