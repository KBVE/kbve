import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { BASE_URL, waitForReady } from './helpers/http';

const ISO_PATH = '/arcade/isometric/';
const ARCADE_PATH = '/arcade/';

describe('Isometric arcade smoke', () => {
	let browser: Browser;

	beforeAll(async () => {
		await waitForReady();
		browser = await chromium.launch({ headless: true });
	});

	afterAll(async () => {
		await browser?.close();
	});

	it('serves the isometric arcade route', async () => {
		const res = await fetch(`${BASE_URL}${ISO_PATH}`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('isometric-game-container');
		expect(body).toContain('id="bevy-canvas"');
		expect(body).toContain('id="root"');
		expect(body).toContain('id="game-loading"');
	});

	it('exposes the Supabase session probe before WASM init', async () => {
		const res = await fetch(`${BASE_URL}${ISO_PATH}`);
		const body = await res.text();
		expect(body).toContain('__KBVE_SESSION_PROBE__');
	});

	it('ships the WebGPU fallback warning card', async () => {
		const res = await fetch(`${BASE_URL}${ISO_PATH}`);
		const body = await res.text();
		expect(body).toContain('webgpu-warning');
		expect(body).toContain('WebGPU Required');
	});

	it('installs the astro:before-preparation full-reload guard', async () => {
		const res = await fetch(`${BASE_URL}${ISO_PATH}`);
		const body = await res.text();
		expect(body).toContain('astro:before-preparation');
		expect(body).toContain('/arcade/isometric');
		expect(body).toContain('window.location.assign');
	});

	it('exposes the __KBVE_ISOMETRIC_BOOTED__ double-init guard', async () => {
		const res = await fetch(`${BASE_URL}${ISO_PATH}`);
		const body = await res.text();
		expect(body).toContain('__KBVE_ISOMETRIC_BOOTED__');
	});

	it('renders the isometric container and loading card in the browser', async () => {
		const { page, errors } = await openIsoPage(browser);
		try {
			await page.locator('.isometric-game-container').waitFor({
				state: 'visible',
				timeout: 15_000,
			});

			const canvas = page.locator('#bevy-canvas');
			expect(await canvas.count()).toBe(1);

			const root = page.locator('#root');
			expect(await root.count()).toBe(1);

			// Either WASM init proceeds (loading visible) or the WebGPU
			// warning kicks in — both are valid for a headless browser
			// without a stable WebGPU implementation.
			const loadingVisible = await page
				.locator('#game-loading')
				.isVisible();
			const warningVisible = await page
				.locator('#webgpu-warning')
				.isVisible();
			expect(loadingVisible || warningVisible).toBe(true);

			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('forces a real navigation across the /arcade/isometric boundary', async () => {
		const { page, errors } = await openPage(browser, ARCADE_PATH);
		try {
			// Track full-page loads as opposed to ClientRouter swaps. A real
			// navigation fires the `load` event; a swap does not.
			let realLoads = 0;
			page.on('load', () => {
				realLoads += 1;
			});

			// First load already happened during goto; reset counter so we
			// only count the navigation we trigger next.
			realLoads = 0;

			await page.evaluate((to) => {
				window.location.assign(to);
			}, ISO_PATH);

			await page.waitForURL(`**${ISO_PATH}`, { timeout: 15_000 });
			await page
				.locator('.isometric-game-container')
				.waitFor({ state: 'visible', timeout: 15_000 });

			expect(realLoads).toBeGreaterThanOrEqual(1);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});

async function openIsoPage(browser: Browser) {
	return openPage(browser, ISO_PATH);
}

async function openPage(
	browser: Browser,
	path: string,
): Promise<{ page: Page; errors: string[] }> {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (err) => {
		errors.push(err.message);
	});
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			const text = msg.text();
			// Filter expected failures in headless test runs:
			// - WASM modules can't fully bootstrap WebGPU under headless
			// - Tauri invoke calls fail in browser
			// - Supabase auth probe has no session
			if (
				text.includes('WebGPU') ||
				text.includes('Tauri') ||
				text.includes('TAURI') ||
				text.includes('session') ||
				text.includes('wasm')
			) {
				return;
			}
			errors.push(text);
		}
	});
	await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
	return { page, errors };
}
