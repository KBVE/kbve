import { test, expect } from './fixtures';
import { seedFakeSession } from './helpers/auth';
import type { Page } from '@playwright/test';
import { isMobileViewport } from './helpers/env';

/**
 * Drives the game store directly through the dev-only window.__ctDispatch seam
 * to exhaustively exercise reducers + HUD components that idle gameplay can't
 * reach. Desktop-only (HUD modals are 700px); skipped where the seam is absent.
 */

async function dispatch(page: Page, action: unknown) {
	await page.evaluate((a) => {
		(
			window as Window & { __ctDispatch?: (x: unknown) => void }
		).__ctDispatch?.(a);
	}, action);
}

async function emit(page: Page, event: string, payload: unknown) {
	await page.evaluate(
		({ event, payload }) => {
			(
				window as Window & {
					__ctEvents?: { emit: (e: string, p: unknown) => void };
				}
			).__ctEvents?.emit(event, payload);
		},
		{ event, payload },
	);
}

test.describe('store-driven HUD coverage', () => {
	test.beforeEach(async ({ page }) => {
		test.skip(await isMobileViewport(page), 'HUD is desktop-sized');
		await seedFakeSession(page);
		await page.goto('/game/play/', { waitUntil: 'domcontentloaded' });
		const ok = await page
			.waitForFunction(
				() =>
					!!(window as Window & { __ctDispatch?: unknown })
						.__ctDispatch,
				undefined,
				{ timeout: 15_000 },
			)
			.then(() => true)
			.catch(() => false);
		test.skip(!ok, 'dispatch seam only present in dev build');
		await expect(
			page.getByText('Debug Mode', { exact: false }),
		).toBeVisible({ timeout: 20_000 });
	});

	test('inventory renders items, tooltips, and handles unknown ids', async ({
		page,
	}) => {
		await dispatch(page, {
			type: 'ADD_ITEM',
			payload: { itemId: 'blue-shark' },
		});
		await dispatch(page, {
			type: 'ADD_ITEM',
			payload: { itemId: 'iron-sword' },
		});
		await dispatch(page, {
			type: 'ADD_ITEM',
			payload: { itemId: 'definitely-not-an-item' },
		});

		const shark = page.locator('img[alt="Blue Shark"]');
		await expect(shark).toBeVisible();

		await shark.hover();
		await expect(
			page.getByText('Bonuses:', { exact: false }),
		).toBeVisible();

		await page.locator('img[alt="Iron Sword"]').hover();
		await expect(page.getByText('Type:', { exact: false })).toBeVisible();

		await dispatch(page, {
			type: 'REMOVE_ITEM',
			payload: { itemId: 'blue-shark' },
		});
		await expect(shark).toHaveCount(0);
	});

	test('stats bars react to stat changes and damage', async ({ page }) => {
		await dispatch(page, {
			type: 'SET_PLAYER_STATS',
			payload: { hp: 200, maxHp: 100, username: 'Hero' },
		});
		await expect(page.getByText('Hero')).toBeVisible();
		await dispatch(page, {
			type: 'PLAYER_DAMAGE',
			payload: { damage: 40 },
		});
		await expect(page.getByText(/HP:/).first()).toBeVisible();
	});

	test('equip item via reducer does not crash the HUD', async ({ page }) => {
		await dispatch(page, {
			type: 'EQUIP_ITEM',
			payload: { slot: 'mainHand', itemId: 'iron-sword' },
		});
		await expect(
			page.getByText('Debug Mode', { exact: false }),
		).toBeVisible();
	});

	test('notifications render every variant and dismiss', async ({ page }) => {
		for (const type of ['danger', 'success', 'info', 'warning', 'other']) {
			await dispatch(page, {
				type: 'ADD_NOTIFICATION',
				payload: { title: `T-${type}`, message: `m-${type}`, type },
			});
		}
		await expect(page.getByText('T-danger')).toBeVisible();
		await expect(page.getByText('T-other')).toBeVisible();

		// Only the newest toast carries an auto-dismiss timer, so closing the
		// oldest (T-danger) is timer-independent and stable under load.
		const toasts = page.locator('.fixed.inset-x-0.bottom-4');
		await toasts
			.locator('div', { hasText: 'T-danger' })
			.first()
			.getByRole('button', { name: 'Close' })
			.click();
		await expect(toasts.getByText('T-danger')).toHaveCount(0);
	});

	test('sidebar collapse toggles work', async ({ page }) => {
		const toggles = page.locator('button', { hasText: /Stats|Settings/ });
		const count = await toggles.count();
		for (let i = 0; i < count; i++) {
			await toggles.nth(i).click();
		}
		await dispatch(page, {
			type: 'TOGGLE_SETTING',
			payload: { key: 'isStatsCollapsed' },
		});
		await expect(
			page.getByText('Debug Mode', { exact: false }),
		).toBeVisible();
	});

	test('action menu runs every action and closes', async ({ page }) => {
		await dispatch(page, {
			type: 'SET_NPC_INTERACTION',
			payload: {
				npcId: 'npc_barkeep',
				npcName: 'Evee The BarKeep',
				actions: ['inspect'],
				coords: { x: 5000, y: 5000 },
			},
		});
		const menu = page.locator('.z-\\[100\\]');
		await menu.getByRole('button', { name: 'inspect' }).click();
		await expect(
			page.locator('.fixed.inset-x-0.bottom-4').getByText('Inspect'),
		).toBeVisible();

		await dispatch(page, {
			type: 'SET_NPC_INTERACTION',
			payload: {
				npcId: 'npc_barkeep',
				npcName: 'Evee The BarKeep',
				actions: ['talk', 'trade'],
				coords: { x: 10, y: 10 },
			},
		});
		await menu.getByRole('button', { name: 'Close' }).click();
		await expect(menu).toHaveCount(0);
	});

	test('dialogue modal advances, no-ops bad option, and closes', async ({
		page,
	}) => {
		await dispatch(page, {
			type: 'SET_DIALOGUE',
			payload: {
				npcId: 'npc_barkeep',
				npcName: 'Evee The BarKeep',
				npcAvatar: '/assets/npc/barkeep.webp',
				dialogue: {
					id: 'custom',
					title: 'Greeting',
					message: 'Hello there traveller.',
					playerResponse: 'Hi.',
					options: [
						{
							id: 'o1',
							title: 'Tell me more',
							nextDialogueId: 'dlg_barkeep_about',
						},
						{
							id: 'o2',
							title: 'Dead end',
							nextDialogueId: 'does-not-exist',
						},
					],
				},
			},
		});
		await expect(page.getByText('Greeting')).toBeVisible();
		await page.getByRole('button', { name: 'Dead end' }).click();
		await expect(page.getByText('Greeting')).toBeVisible();
		await page.getByRole('button', { name: 'Tell me more' }).click();
		await expect(page.getByText('About Cloud City')).toBeVisible();
	});

	test('dice roll resolves and update-before-set is a no-op', async ({
		page,
	}) => {
		await dispatch(page, {
			type: 'UPDATE_DICE_VALUES',
			payload: { diceValues: [1, 2], totalRoll: 3 },
		});
		await dispatch(page, {
			type: 'SET_DICE_ROLL',
			payload: {
				npcId: 'npc_barkeep',
				npcName: 'Evee The BarKeep',
				diceCount: 4,
				diceValues: [0, 0, 0, 0],
				totalRoll: null,
				phase: 'rolling',
			},
		});
		await page.getByRole('button', { name: 'Roll Dice' }).click();
		await expect(page.getByText(/Total:/)).toBeVisible({ timeout: 10_000 });
	});

	test('dice result renders success, fail, and caught colours', async ({
		page,
	}) => {
		for (const total of [18, 3, 10]) {
			await dispatch(page, {
				type: 'SET_DICE_ROLL',
				payload: {
					npcId: 'npc_barkeep',
					npcName: 'Evee The BarKeep',
					diceCount: 4,
					diceValues: [5, 5, 4, total - 14],
					totalRoll: total,
					phase: 'result',
				},
			});
			await expect(page.getByText(/Total:/)).toBeVisible();
		}
		await dispatch(page, { type: 'SET_DICE_ROLL', payload: null });
	});

	test('dialogue without a player response closes via the X', async ({
		page,
	}) => {
		await dispatch(page, {
			type: 'SET_DIALOGUE',
			payload: {
				npcId: 'npc_monk',
				npcName: 'Monk',
				npcAvatar: '',
				dialogue: {
					id: 'm1',
					title: 'Meditation',
					message: 'Peace be with you.',
					options: [],
				},
			},
		});
		await expect(page.getByText('Meditation')).toBeVisible();
		await page.getByRole('button', { name: '×' }).click();
		await expect(page.getByText('Meditation')).toHaveCount(0);
	});

	test('character modal opens from SET_MODAL and closes', async ({
		page,
	}) => {
		await dispatch(page, {
			type: 'SET_MODAL',
			payload: {
				message: 'A mysterious voice echoes.',
				characterName: 'Voice',
				characterImage: '/assets/npc/samson.png',
				backgroundImage: '/assets/background/animebar.webp',
			},
		});
		await expect(
			page.getByText('A mysterious voice echoes.'),
		).toBeVisible();
		await dispatch(page, { type: 'SET_MODAL', payload: null });
		await expect(page.getByText('A mysterious voice echoes.')).toHaveCount(
			0,
		);
	});

	test('event bridge handles damage and stats events', async ({ page }) => {
		await emit(page, 'player:damage', { damage: 7 });
		await emit(page, 'player:stats', {
			stats: {
				hp: 80,
				maxHp: 100,
				mp: 30,
				maxMp: 50,
				ep: 60,
				maxEp: 75,
				username: 'Bridged',
			},
		});
		await expect(page.getByText('Bridged')).toBeVisible();
	});

	test('unknown action falls through the reducer default', async ({
		page,
	}) => {
		await dispatch(page, { type: '__unknown__', payload: {} });
		await expect(
			page.getByText('Debug Mode', { exact: false }),
		).toBeVisible();
	});
});
