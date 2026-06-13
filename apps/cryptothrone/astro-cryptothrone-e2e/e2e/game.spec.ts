import { test, expect } from './fixtures';
import { supportsWebGL } from './helpers/env';
import { seedFakeSession } from './helpers/auth';

test.describe('game page layout', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/game/play/');
		await expect(page.locator('.game-fullscreen')).toBeAttached();
	});

	test('renders the full-bleed game overlay', async ({ page }) => {
		await expect(page.locator('.game-fullscreen')).toBeAttached();
	});

	test('nav bar stays visible while the game is active', async ({ page }) => {
		await expect(page.locator('header').first()).toBeVisible();
	});

	test('body scroll is locked on the game page', async ({ page }) => {
		const overflow = await page.evaluate(
			() => getComputedStyle(document.body).overflow,
		);
		expect(overflow).toBe('hidden');
	});
});

test.describe('auth gate', () => {
	test('unauthenticated visit shows the sign-in panel', async ({ page }) => {
		await page.goto('/game/play/');
		await expect(
			page.getByRole('button', { name: 'Sign in with GitHub' }),
		).toBeVisible({ timeout: 20_000 });
		await expect(
			page.getByRole('button', { name: 'Sign in with Discord' }),
		).toBeVisible();
	});
});

test.describe('game UI hydration', () => {
	test.beforeEach(async ({ page }) => {
		await seedFakeSession(page);
	});

	test('React HUD island mounts with the settings panel', async ({
		page,
	}) => {
		await page.goto('/game/play/', { waitUntil: 'domcontentloaded' });
		await expect(
			page.getByText('Debug Mode', { exact: false }),
		).toBeVisible({ timeout: 20_000 });
	});

	test('debug-mode toggle is interactive', async ({ page }) => {
		await page.goto('/game/play/', { waitUntil: 'domcontentloaded' });
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
		await seedFakeSession(page);
		await page.goto('/game/play/', { waitUntil: 'domcontentloaded' });
		const canvas = page.locator('.game-fullscreen canvas').first();
		await expect(canvas).toBeAttached({ timeout: 30_000 });
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);
	});
});
