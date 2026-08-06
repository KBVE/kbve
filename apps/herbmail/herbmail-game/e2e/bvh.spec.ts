import { test, expect, type Page } from '@playwright/test';

interface BvhStats {
	depth: number;
	built: number;
	ms: number;
	draining: boolean;
}

declare global {
	interface Window {
		__bvh: { stats: () => BvhStats };
		__coll?: { pos: unknown };
	}
}

async function enterDungeon(page: Page): Promise<void> {
	await page.goto('/', { waitUntil: 'load' });
	await page.getByText('Play', { exact: true }).click({ timeout: 60_000 });
	await page.waitForFunction(
		() => typeof window.__coll?.pos === 'object',
		undefined,
		{
			timeout: 90_000,
		},
	);
}

test.describe('bvh queue', () => {
	// The queue peaks in the thousands while a dungeon mounts and must return to
	// zero: anything still queued is a chunk whose raycasts silently take the
	// uncached path. It used to drain one chunk per idle callback, which cleared
	// fine here but never cleared on a slow machine — reproduce that locally with
	// CDP Emulation.setCPUThrottlingRate at 6x, where it stalled at 162 of 1058
	// built after 48 seconds.
	test('drains to empty after the load burst', async ({ page }) => {
		await enterDungeon(page);

		await page.waitForFunction(
			() => {
				const s = window.__bvh.stats();
				return s.built > 0 && s.depth === 0 && !s.draining;
			},
			undefined,
			{ timeout: 60_000 },
		);

		const stats = await page.evaluate(() => window.__bvh.stats());
		expect(stats.depth).toBe(0);
		expect(stats.built).toBeGreaterThan(100);
		expect(stats.draining).toBe(false);
	});

	test('stays drained while the player moves through sectors', async ({
		page,
	}) => {
		await enterDungeon(page);
		await page.waitForFunction(
			() => window.__bvh.stats().depth === 0,
			undefined,
			{
				timeout: 60_000,
			},
		);
		const before = await page.evaluate(() => window.__bvh.stats().built);

		for (const key of ['w', 'a', 's', 'd']) {
			await page.keyboard.down(key);
			await page.waitForTimeout(1200);
			await page.keyboard.up(key);
		}

		await page.waitForFunction(
			() => window.__bvh.stats().depth === 0,
			undefined,
			{
				timeout: 60_000,
			},
		);
		const after = await page.evaluate(() => window.__bvh.stats());
		expect(after.depth).toBe(0);
		expect(after.built).toBeGreaterThanOrEqual(before);
	});
});
