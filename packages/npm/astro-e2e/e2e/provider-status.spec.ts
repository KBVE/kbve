import { test, expect } from '@playwright/test';

test.describe('DroidProvider.astro + DroidStatus.astro Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/provider');
		await page.getByTestId('provider-status-test').waitFor({ state: 'visible' });
	});

	test('DroidStatus renders within DroidProvider', async ({ page }) => {
		await expect(page.getByTestId('droid-status')).toBeVisible({ timeout: 10_000 });
	});

	test('DroidProvider initializes droid and DroidStatus reflects state', async ({ page }) => {
		await expect(page.getByTestId('droid-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
	});

	test('DroidStatus shows event bus availability after init', async ({ page }) => {
		await expect(page.getByTestId('droid-has-events')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
	});

	test('useDroidContext provides same state as DroidStatus', async ({ page }) => {
		await expect(page.getByTestId('ctx-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
		await expect(page.getByTestId('ctx-has-events')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
	});

	test('no initialization error is displayed', async ({ page }) => {
		await expect(page.getByTestId('droid-initialized')).toHaveAttribute(
			'data-value',
			'true',
			{ timeout: 10_000 },
		);
		await expect(page.getByTestId('droid-error')).not.toBeVisible();
		await expect(page.getByTestId('ctx-error')).toHaveAttribute('data-value', '');
	});

	test('DroidStatus receives className via cn utility', async ({ page }) => {
		const statusEl = page.getByTestId('droid-status');
		await expect(statusEl).toBeVisible({ timeout: 10_000 });
		const className = await statusEl.getAttribute('class');
		expect(className).toContain('droid-status');
		expect(className).toContain('test-status');
	});
});

test.describe('useDroidContext outside DroidProvider', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/provider');
	});

	test('throws error when used outside provider', async ({ page }) => {
		const errorEl = page.getByTestId('outside-error');
		await expect(errorEl).toBeVisible({ timeout: 10_000 });
		await expect(errorEl).toHaveAttribute(
			'data-value',
			expect.stringContaining('useDroidContext must be used within a <DroidProvider>'),
		);
	});
});

test.describe('cn utility', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/provider');
	});

	test('merges conflicting Tailwind classes correctly', async ({ page }) => {
		const cnEl = page.getByTestId('cn-result');
		await expect(cnEl).toBeVisible({ timeout: 10_000 });
		const result = await cnEl.getAttribute('data-value');
		expect(result).toContain('px-8');
		expect(result).toContain('py-2');
		expect(result).toContain('font-bold');
		expect(result).not.toContain('px-4');
	});
});
