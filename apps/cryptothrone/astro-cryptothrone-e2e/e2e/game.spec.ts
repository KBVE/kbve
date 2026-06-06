import { test, expect } from '@playwright/test';
import { supportsWebGL } from './helpers/env';

test.describe('game page layout', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/game/play/');
		await expect(page.locator('.game-fullscreen')).toBeAttached();
	});

	test('renders the full-bleed game overlay', async ({ page }) => {
		await expect(page.locator('.game-fullscreen')).toBeAttached();
	});

	test('Starlight header is hidden while the game is active', async ({
		page,
	}) => {
		await expect(page.locator('header').first()).toBeHidden();
	});

	test('body scroll is locked on the game page', async ({ page }) => {
		const overflow = await page.evaluate(
			() => getComputedStyle(document.body).overflow,
		);
		expect(overflow).toBe('hidden');
	});
});

test.describe('game UI hydration', () => {
	test('React HUD island mounts with the settings panel', async ({
		page,
	}) => {
		await page.goto('/game/play/');
		await expect(
			page.getByText('Debug Mode', { exact: false }),
		).toBeVisible({ timeout: 20_000 });
	});

	test('debug-mode toggle is interactive', async ({ page }) => {
		await page.goto('/game/play/');
		const label = page.locator('label', { hasText: 'Debug Mode' });
		const toggle = label.locator('input[type="checkbox"]');
		await expect(toggle).toBeAttached({ timeout: 20_000 });
		const before = await toggle.isChecked();
		await toggle.evaluate((el) => (el as HTMLInputElement).click());
		await expect(toggle).toBeChecked({ checked: !before });
	});
});

test.describe('Phaser runtime (WebGL)', () => {
	test('canvas mounts inside the overlay', async ({ page, browserName }) => {
		test.skip(
			!supportsWebGL(browserName),
			'headless WebGL only reliable on chromium',
		);
		await page.goto('/game/play/');
		const canvas = page.locator('.game-fullscreen canvas');
		await expect(canvas).toBeAttached({ timeout: 30_000 });
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);
	});
});
