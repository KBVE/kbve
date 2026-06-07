import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { isMobileViewport, supportsWebGL } from './helpers/env';

/**
 * Real gameplay automation: navigates the player around the Phaser scene with
 * grid-engine pathfinding + holds the F interaction key to fire the quadtree
 * range callbacks in CloudCityScene. Chromium + desktop only (needs WebGL and
 * the dev __ctGame hook).
 */

async function waitForGame(page: Page): Promise<boolean> {
	return page
		.waitForFunction(
			() =>
				!!(
					window as Window & {
						__ctGame?: { gridEngine: { getPosition: unknown } };
					}
				).__ctGame?.gridEngine,
			{ timeout: 15_000 },
		)
		.then(() => true)
		.catch(() => false);
}

async function walkTo(page: Page, x: number, y: number) {
	await page.evaluate(
		({ x, y }) => {
			(
				window as Window & {
					__ctGame?: {
						gridEngine: {
							moveTo: (
								id: string,
								t: { x: number; y: number },
							) => void;
						};
					};
				}
			).__ctGame?.gridEngine.moveTo('player', { x, y });
		},
		{ x, y },
	);
	await page
		.waitForFunction(
			({ x, y }) => {
				const p = (
					window as Window & {
						__ctGame?: {
							gridEngine: {
								getPosition: (id: string) => {
									x: number;
									y: number;
								};
							};
						};
					}
				).__ctGame?.gridEngine.getPosition('player');
				return !!p && p.x === x && p.y === y;
			},
			{ x, y },
			{ timeout: 20_000 },
		)
		.catch(() => undefined);
}

async function interactExpect(page: Page, text: RegExp) {
	await page.keyboard.down('KeyF');
	await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
	await page.keyboard.up('KeyF');
	await page.getByRole('button', { name: 'Okay' }).click();
	await expect(page.getByText(text)).toHaveCount(0);
}

test.describe('gameplay: scene range interactions', () => {
	test.beforeEach(async ({ page, browserName }) => {
		test.skip(await isMobileViewport(page), 'desktop-only gameplay');
		test.skip(!supportsWebGL(browserName), 'needs headless WebGL');
		await page.goto('/game/play/');
		const ready = await waitForGame(page);
		test.skip(
			!ready,
			'scene dev hook (__ctGame) only present in the dev build',
		);
		await page
			.locator('.game-fullscreen canvas')
			.click({ position: { x: 5, y: 5 } });
	});

	test('F at spawn triggers the well/sand-pit range', async ({ page }) => {
		await interactExpect(page, /sand pits/i);
	});

	test('walking the player triggers reachable range zones', async ({
		page,
	}) => {
		await interactExpect(page, /sand pits/i);

		await walkTo(page, 4, 4);
		await interactExpect(page, /Welcome to Cloud City/i);

		await walkTo(page, 8, 10);
		await interactExpect(page, /Samson the Great/i);
	});
});
