import { test, expect, type ConsoleMessage } from '@playwright/test';

const HOST_PAGE = '/yuki/?yuki-debug=1';
const READY_MARK = '[yuki-vrm] mount ready';
const LEGACY_LOAD_MARK = '[yuki-vrm] loaded';
const FIRST_RENDER_MARK = '[yuki-vrm] first render';
const MOUNT_TIMEOUT = 30_000;

test.describe('yuki vrm smoke', () => {
	test('VRM mounts with humanoid + populated scene + paints pixels to canvas', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		const readyMessages: ConsoleMessage[] = [];
		const firstRenderMessages: ConsoleMessage[] = [];

		page.on('console', (msg) => {
			const text = msg.text();
			if (msg.type() === 'error') consoleErrors.push(text);
			if (text.includes(READY_MARK) || text.includes(LEGACY_LOAD_MARK)) {
				readyMessages.push(msg);
			}
			if (text.includes(FIRST_RENDER_MARK)) {
				firstRenderMessages.push(msg);
			}
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
			.poll(() => readyMessages.length, { timeout: MOUNT_TIMEOUT })
			.toBeGreaterThan(0);

		const readyArgs = readyMessages[0].args();
		expect(readyArgs.length).toBeGreaterThanOrEqual(2);
		const payload = (await readyArgs[1].jsonValue()) as {
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

		const sawFirstRender = await pollOptional(
			() => firstRenderMessages.length > 0,
			6_000,
		);
		if (sawFirstRender) {
			const renderArgs = firstRenderMessages[0].args();
			if (renderArgs.length >= 2) {
				const renderPayload = (await renderArgs[1].jsonValue()) as {
					canvasSize: { w: number; h: number };
					webglContextLost: boolean | string;
				};
				expect(renderPayload.webglContextLost).not.toBe(true);
				expect(renderPayload.canvasSize.w).toBeGreaterThan(0);
				expect(renderPayload.canvasSize.h).toBeGreaterThan(0);
			}
		}

		// Settle a few frames so the rest-pose + lookAt smoothing finish
		// before the screenshot diff. Animations are disabled at the
		// project level (playwright.config.ts `animations: 'disabled'`)
		// but the render loop itself keeps ticking — give it 600 ms to
		// reach a stable frame.
		await page.waitForTimeout(600);

		await expect(canvas).toHaveScreenshot('yuki-vrm-canvas.png', {
			maxDiffPixelRatio: 0.4,
		});

		expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
	});
});

async function pollOptional(
	predicate: () => boolean,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return true;
		await new Promise((r) => setTimeout(r, 100));
	}
	return false;
}
