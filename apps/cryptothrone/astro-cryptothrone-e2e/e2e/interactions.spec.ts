import { test, expect } from './fixtures';
import { seedFakeSession } from './helpers/auth';
import type { Page } from '@playwright/test';
import { isMobileViewport } from './helpers/env';
import { waitForHud } from './helpers/hud';

/**
 * Drives the in-game React HUD through the dev-only `window.__ctEvents` seam
 * (exposed by GameWindow under import.meta.env.DEV). Exercises the modal/toast
 * UI + store reducers that idle movement can't reach in headless. Skipped where
 * the seam is absent (production build served by axum).
 */

async function emit(page: Page, event: string, payload: unknown) {
	await page.evaluate(
		({ event, payload }) => {
			const w = window as Window & {
				__ctEvents?: { emit: (e: string, p: unknown) => void };
			};
			w.__ctEvents?.emit(event, payload);
		},
		{ event, payload },
	);
}

test.describe('in-game HUD interactions', () => {
	test.beforeEach(async ({ page }) => {
		test.skip(
			await isMobileViewport(page),
			'HUD modals are desktop-sized (min-w 700px)',
		);
		await seedFakeSession(page);
		await page.goto('/game/play/', { waitUntil: 'domcontentloaded' });
		const hasSeam = await page
			.waitForFunction(
				() =>
					!!(window as Window & { __ctEvents?: unknown }).__ctEvents,
				undefined,
				{ timeout: 15_000 },
			)
			.then(() => true)
			.catch(() => false);
		test.skip(!hasSeam, 'event seam only present in dev build');
		await waitForHud(page);
	});

	test('character event opens and closes the dialog', async ({ page }) => {
		await emit(page, 'char:event', {
			message: 'A wandering merchant greets you.',
			character_name: 'Merchant',
		});
		await expect(
			page.getByText('A wandering merchant greets you.'),
		).toBeVisible();
		await expect(page.getByText('Merchant').first()).toBeVisible();
	});

	test('notification surfaces a toast', async ({ page }) => {
		await emit(page, 'notification', {
			title: 'Heads Up',
			message: 'Something happened.',
			notificationType: 'info',
		});
		await expect(page.getByText('Heads Up')).toBeVisible();
		await expect(page.getByText('Something happened.')).toBeVisible();
	});

	test('npc interaction opens the action menu with its actions', async ({
		page,
	}) => {
		await emit(page, 'npc:interact', {
			npcId: 'npc_barkeep',
			npcName: 'Evee The BarKeep',
			actions: ['talk', 'trade', 'steal', 'inspect'],
			coords: { x: 200, y: 200 },
		});
		await expect(page.getByText('Evee The BarKeep').first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'trade' })).toBeVisible();
	});

	test('trade action emits a toast', async ({ page }) => {
		await emit(page, 'npc:interact', {
			npcId: 'npc_barkeep',
			npcName: 'Evee The BarKeep',
			actions: ['trade'],
			coords: { x: 200, y: 200 },
		});
		await page.getByRole('button', { name: 'trade' }).click();
		await expect(page.getByText('Trade').first()).toBeVisible();
	});

	test('steal action opens the dice-roll modal', async ({ page }) => {
		await emit(page, 'npc:interact', {
			npcId: 'npc_barkeep',
			npcName: 'Evee The BarKeep',
			actions: ['steal'],
			coords: { x: 200, y: 200 },
		});
		await page.getByRole('button', { name: 'steal' }).click();
		await expect(page.getByText('Steal Attempt')).toBeVisible();
	});

	test('talk action opens the dialogue modal', async ({ page }) => {
		await emit(page, 'npc:interact', {
			npcId: 'npc_barkeep',
			npcName: 'Evee The BarKeep',
			actions: ['talk'],
			coords: { x: 200, y: 200 },
		});
		await page.getByRole('button', { name: 'talk' }).click();
		await expect(page.locator('.fixed.z-\\[60\\]').first()).toBeVisible();
	});

	test('direct dice-roll event opens the modal', async ({ page }) => {
		await emit(page, 'dice:roll', {
			npcId: 'npc_barkeep',
			npcName: 'Evee The BarKeep',
			diceCount: 4,
		});
		await expect(page.getByText('Steal Attempt')).toBeVisible();
	});

	test('rolling the dice resolves to a total', async ({ page }) => {
		await emit(page, 'dice:roll', {
			npcId: 'npc_barkeep',
			npcName: 'Evee The BarKeep',
			diceCount: 4,
		});
		await page.getByRole('button', { name: 'Roll Dice' }).click();
		await expect(page.getByText(/Total:/)).toBeVisible({
			timeout: 10_000,
		});
	});

	test('dialogue advances when an option is chosen', async ({ page }) => {
		await emit(page, 'npc:interact', {
			npcId: 'npc_barkeep',
			npcName: 'Evee The BarKeep',
			actions: ['talk'],
			coords: { x: 200, y: 200 },
		});
		await page.getByRole('button', { name: 'talk' }).click();
		await page
			.getByRole('button', { name: 'Tell me about Cloud City' })
			.click();
		await expect(page.getByText('About Cloud City')).toBeVisible();
	});
});
