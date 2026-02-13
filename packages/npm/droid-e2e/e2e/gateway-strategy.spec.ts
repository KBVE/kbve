import { test, expect } from '@playwright/test';

test.describe('Gateway Strategy Selection', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('nav-gateway').click();
		await page.getByTestId('gateway-test').waitFor({ state: 'visible' });
	});

	test('detects browser capabilities', async ({ page }) => {
		await expect(page.getByTestId('gateway-detected')).toHaveAttribute('data-value', 'true');
		await expect(page.getByTestId('gateway-capabilities')).toBeVisible();
	});

	test('selects a valid strategy', async ({ page }) => {
		const strategy = await page.getByTestId('gateway-strategy').getAttribute('data-value');
		expect(['shared-worker', 'web-worker', 'direct']).toContain(strategy);
	});

	test('provides a strategy description', async ({ page }) => {
		const description = await page.getByTestId('gateway-description').getAttribute('data-value');
		expect(description).toBeTruthy();
		expect(description!.length).toBeGreaterThan(0);
	});

	test('chromium supports SharedWorker', async ({ page }) => {
		// Chromium/Chrome supports SharedWorker
		await expect(page.getByTestId('cap-shared-worker')).toHaveAttribute('data-value', 'true');
		await expect(page.getByTestId('cap-worker')).toHaveAttribute('data-value', 'true');
		await expect(page.getByTestId('cap-broadcast')).toHaveAttribute('data-value', 'true');
	});

	test('chromium selects shared-worker strategy', async ({ page }) => {
		// Chromium has SharedWorker support, so it should pick the shared-worker strategy
		await expect(page.getByTestId('gateway-strategy')).toHaveAttribute('data-value', 'shared-worker');
	});

	test('is not detected as mobile', async ({ page }) => {
		await expect(page.getByTestId('cap-android')).toHaveAttribute('data-value', 'false');
		await expect(page.getByTestId('cap-safari')).toHaveAttribute('data-value', 'false');
	});
});
