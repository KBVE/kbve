import { test, expect, type Page } from '@playwright/test';

const DOCK_SEL = '#kbve-yuki-dock';
const FAB_SEL = '.kbve-yuki-dock__fab';
const PANEL_MOUNTED_SEL = '[data-kbve-yuki-panel-mounted="true"]';

// Clears once per tab, not once per navigation: the reload case is checking
// that the dock restores its persisted state, so a per-navigation wipe would
// erase the very key under test.
async function clearYukiStorage(page: Page): Promise<void> {
	await page.addInitScript(() => {
		try {
			if (sessionStorage.getItem('yuki-e2e:cleared') === '1') return;
			sessionStorage.setItem('yuki-e2e:cleared', '1');
			for (const k of [
				'kbve:yuki-dock:state',
				'kbve:yuki-dock:greeted',
				'kbve:yuki-dock:float-mode',
				'kbve:yuki-dock:float-pos',
			])
				localStorage.removeItem(k);
		} catch {
			/* ignore */
		}
	});
}

async function mockYukiChat(page: Page, chunks: string[]): Promise<void> {
	await page.route('**/api/v1/yuki/chat**', async (route) => {
		const body =
			chunks.map((c) => `data: ${c}\n\n`).join('') +
			'event: done\ndata: {}\n\n';
		await route.fulfill({
			status: 200,
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
			body,
		});
	});
}

test.describe('yuki dock — paint + persist', () => {
	test('FAB renders on initial paint without JS gating the critical path', async ({
		page,
	}) => {
		await clearYukiStorage(page);
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		const fab = page.locator(`${DOCK_SEL} ${FAB_SEL}`).first();
		await expect(fab).toBeVisible({ timeout: 30_000 });
		await expect(fab).toHaveAttribute('aria-expanded', 'false');
	});

	test('click FAB expands dock + lazy panel mounts', async ({ page }) => {
		await clearYukiStorage(page);
		await page.goto('/', { waitUntil: 'load' });
		const fab = page.locator(`${DOCK_SEL} ${FAB_SEL}`).first();
		await expect(fab).toBeVisible({ timeout: 30_000 });
		await fab.click();
		await expect(fab).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator(PANEL_MOUNTED_SEL).first()).toBeVisible({
			timeout: 15_000,
		});
		const dockState = await page
			.locator(DOCK_SEL)
			.first()
			.getAttribute('data-state');
		expect(dockState).toBe('expanded');
	});

	test('expanded state persists across reload (transition:persist + localStorage)', async ({
		page,
	}) => {
		await clearYukiStorage(page);
		await page.goto('/', { waitUntil: 'load' });
		const fab = page.locator(`${DOCK_SEL} ${FAB_SEL}`).first();
		await expect(fab).toBeVisible({ timeout: 30_000 });
		await fab.click();
		await expect(fab).toHaveAttribute('aria-expanded', 'true');
		const stored = await page.evaluate(() =>
			localStorage.getItem('kbve:yuki-dock:state'),
		);
		expect(stored).toBe('expanded');
		await page.reload({ waitUntil: 'load' });
		const fabAfter = page.locator(`${DOCK_SEL} ${FAB_SEL}`).first();
		await expect(fabAfter).toHaveAttribute('aria-expanded', 'true', {
			timeout: 30_000,
		});
		await expect(page.locator(PANEL_MOUNTED_SEL).first()).toBeVisible({
			timeout: 15_000,
		});
	});
});

test.describe('yuki dock — greet flag', () => {
	test('greeted flag flips to "1" exactly once on first FAB open', async ({
		page,
	}) => {
		await clearYukiStorage(page);
		await page.goto('/', { waitUntil: 'load' });
		const fab = page.locator(`${DOCK_SEL} ${FAB_SEL}`).first();
		await expect(fab).toBeVisible({ timeout: 30_000 });
		const before = await page.evaluate(() =>
			localStorage.getItem('kbve:yuki-dock:greeted'),
		);
		expect(before).toBeNull();
		await fab.click();
		await expect(page.locator(PANEL_MOUNTED_SEL).first()).toBeVisible({
			timeout: 15_000,
		});
		// The flag guards the first greet animation, so it is only written
		// once the VRM runtime exists — the panel opens in text mode.
		const mode = page.locator('input[data-kbve-yuki-mode]');
		await expect(mode).toBeVisible({ timeout: 15_000 });
		if (!(await mode.isChecked())) await mode.check();
		await expect
			.poll(
				() =>
					page.evaluate(() =>
						localStorage.getItem('kbve:yuki-dock:greeted'),
					),
				{
					timeout: 15_000,
				},
			)
			.toBe('1');
	});
});

test.describe('yuki dock — SSE chat consumer', () => {
	test('chat submit consumes /api/v1/yuki/chat SSE + done terminator', async ({
		page,
	}) => {
		await clearYukiStorage(page);
		await mockYukiChat(page, ['Hello.', ' World.']);
		await page.goto('/', { waitUntil: 'load' });
		const fab = page.locator(`${DOCK_SEL} ${FAB_SEL}`).first();
		await expect(fab).toBeVisible({ timeout: 30_000 });
		await fab.click();
		await expect(page.locator(PANEL_MOUNTED_SEL).first()).toBeVisible({
			timeout: 15_000,
		});

		const input = page
			.locator(
				`${DOCK_SEL} input[type="text"], ${DOCK_SEL} input:not([type]), ${DOCK_SEL} textarea`,
			)
			.first();
		await expect(input).toBeVisible({ timeout: 15_000 });
		const requestPromise = page.waitForRequest((req) =>
			req.url().includes('/api/v1/yuki/chat'),
		);
		await input.fill('hi yuki');
		await input.press('Enter');
		const req = await requestPromise;
		expect(req.url()).toContain('q=hi%20yuki');

		// The consumer half of the SSE contract, which used to be asserted
		// against a live axum container from axum-kbve-e2e. The handler's own
		// half -- the 400s, the chunk split, the `done` terminator -- is
		// covered by the unit tests in transport/yuki.rs.
		const bubbles = page.locator(
			`${DOCK_SEL} .yuki-msg--yuki .yuki-msg__bubble`,
		);
		await expect(bubbles.last()).toContainText('Hello. World.', {
			timeout: 15_000,
		});
	});
});
