import { test, expect, type ConsoleMessage } from '@playwright/test';

const HOST_PAGE = '/yuki/?yuki-debug=1';
const LOAD_MARK = '[yuki-vrm] loaded';
const MOUNT_TIMEOUT = 30_000;

test.describe('yuki vrm smoke', () => {
	test('VRM mounts with humanoid + populated scene under ?yuki-debug=1', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		const debugMessages: ConsoleMessage[] = [];

		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
			if (msg.text().includes(LOAD_MARK)) debugMessages.push(msg);
		});

		await page.goto(HOST_PAGE, { waitUntil: 'load' });

		const fab = page.locator('.kbve-yuki-dock__fab[data-kbve-yuki-toggle]');
		await expect(fab).toBeVisible({ timeout: MOUNT_TIMEOUT });
		await fab.click();

		const panel = page.locator('[data-kbve-yuki-mount]');
		await expect(panel).toBeVisible({ timeout: MOUNT_TIMEOUT });

		const mode = page.locator('input[data-kbve-yuki-mode]');
		await expect(mode).toBeVisible({ timeout: MOUNT_TIMEOUT });
		if (!(await mode.isChecked())) {
			await mode.check();
		}

		await expect
			.poll(() => debugMessages.length, { timeout: MOUNT_TIMEOUT })
			.toBeGreaterThan(0);

		const args = debugMessages[0].args();
		expect(args.length).toBeGreaterThanOrEqual(2);
		const payload = (await args[1].jsonValue()) as {
			hasHumanoid: boolean;
			sceneChildren: number;
			canvasSize: { w: number; h: number };
			hostSize: { w: number; h: number };
			vrmUrl: string;
		};
		expect(payload.hasHumanoid).toBe(true);
		expect(payload.sceneChildren).toBeGreaterThanOrEqual(3);
		expect(payload.vrmUrl).toMatch(/witch-mimiko-meadow\.vrm$/);

		const canvas = page.locator('canvas.yuki-vrm__canvas');
		await expect(canvas).toBeVisible({ timeout: MOUNT_TIMEOUT });
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);

		expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
	});
});
