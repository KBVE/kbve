import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const TD_URL = '/arcade/towerdefense/';

async function gotoTd(page: Page) {
	await page.goto(TD_URL, { waitUntil: 'load' });
	const canvas = page.locator('canvas');
	await expect(canvas.first()).toBeVisible({ timeout: 30_000 });
	return canvas.first();
}

async function startGame(page: Page) {
	await gotoTd(page);
	const play = page.locator('button.td-title-play');
	await expect(play).toBeVisible({ timeout: 30_000 });
	await play.click();
	await expect(play).toHaveCount(0);
}

test.describe('tower defense smoke', () => {
	test('arcade page loads and mounts a sized canvas', async ({ page }) => {
		const canvas = await gotoTd(page);
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);
	});

	test('title screen renders a Play button', async ({ page }) => {
		await gotoTd(page);
		await expect(page.locator('button.td-title-play')).toBeVisible({
			timeout: 30_000,
		});
	});
});

test.describe('tower defense HUD', () => {
	test('Gold, Nexus, and Wave chips render after starting', async ({
		page,
	}) => {
		await startGame(page);
		await expect(
			page.locator('.td-chip-label', { hasText: 'Gold' }).first(),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			page.locator('.td-chip-label', { hasText: 'Nexus' }).first(),
		).toBeVisible();
		await expect(
			page.locator('.td-chip-label', { hasText: 'Wave' }).first(),
		).toBeVisible();
	});

	test('speed buttons render and the 2× option becomes active on click', async ({
		page,
	}) => {
		await startGame(page);
		const oneX = page.locator('button.td-speed-btn', { hasText: '1×' });
		const twoX = page.locator('button.td-speed-btn', { hasText: '2×' });
		const threeX = page.locator('button.td-speed-btn', { hasText: '3×' });
		await expect(oneX).toBeVisible();
		await expect(twoX).toBeVisible();
		await expect(threeX).toBeVisible();
		await twoX.click();
		await expect(twoX).toHaveClass(/td-speed-btn-active/);
	});
});

test.describe('tower defense palette', () => {
	test('village palette button is reachable and selectable', async ({
		page,
	}) => {
		await startGame(page);
		const palette = page.locator('.td-palette');
		await expect(palette).toBeVisible();
		const village = page.locator('button[data-pal-id="village"]');
		await expect(village).toHaveCount(1, { timeout: 15_000 });
		await village.scrollIntoViewIfNeeded();
		await village.click();
		await expect(village).toHaveClass(/td-pal-active/);
	});
});

test.describe('tower defense input', () => {
	test('digit keys 1–9 do not throw and stay on the TD route', async ({
		page,
	}) => {
		await startGame(page);
		const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
		for (const d of digits) {
			await page.keyboard.press(`Digit${d}`);
		}
		expect(page.url()).toContain('/arcade/towerdefense');
		await expect(page.locator('canvas').first()).toBeVisible();
	});

	test('ESC press does not throw and canvas stays mounted', async ({
		page,
	}) => {
		await startGame(page);
		await page.keyboard.press('Escape');
		await expect(page.locator('canvas').first()).toBeVisible();
	});
});
