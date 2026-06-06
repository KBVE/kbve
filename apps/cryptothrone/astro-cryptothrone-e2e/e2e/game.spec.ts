import { test, expect } from '@playwright/test';

test.describe('astro-cryptothrone game page', () => {
	test('play page renders the full-bleed game overlay', async ({ page }) => {
		await page.goto('/game/play/');
		await expect(page.locator('.game-fullscreen')).toBeAttached();
	});

	test('Starlight chrome is hidden while the game is active', async ({
		page,
	}) => {
		await page.goto('/game/play/');
		await expect(page.locator('.game-fullscreen')).toBeAttached();
		await expect(page.locator('header').first()).toBeHidden();
	});

	test('Phaser canvas mounts inside the overlay', async ({ page }) => {
		await page.goto('/game/play/');
		await expect(page.locator('.game-fullscreen canvas')).toBeAttached({
			timeout: 30_000,
		});
	});

	test('body scroll is locked on the game page', async ({ page }) => {
		await page.goto('/game/play/');
		await expect(page.locator('.game-fullscreen')).toBeAttached();
		const overflow = await page.evaluate(
			() => getComputedStyle(document.body).overflow,
		);
		expect(overflow).toBe('hidden');
	});
});
