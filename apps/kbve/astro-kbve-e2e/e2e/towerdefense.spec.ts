import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { BASE_URL, waitForReady } from './helpers/http';

const TOWERDEFENSE_PATH = '/arcade/towerdefense/';
const MISSPELL_PATH = '/arcade/towerdefence/';

describe('Tower defense arcade smoke', () => {
	let browser: Browser;

	beforeAll(async () => {
		await waitForReady();
		browser = await chromium.launch({ headless: true });
	});

	afterAll(async () => {
		await browser?.close();
	});

	it('serves the tower defense arcade route', async () => {
		const res = await fetch(`${BASE_URL}${TOWERDEFENSE_PATH}`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('towerdefense-game-container');
	});

	it('redirects /towerdefence misspelling to /towerdefense', async () => {
		const res = await fetch(`${BASE_URL}${MISSPELL_PATH}`, {
			redirect: 'manual',
		});
		expect([301, 302, 308]).toContain(res.status);
		const loc = res.headers.get('location') ?? '';
		expect(loc).toContain('/arcade/towerdefense');
	});

	it('renders the Phaser canvas in the game container', async () => {
		const { page, errors } = await openTdPage(browser);
		try {
			await page.locator('#towerdefense-game-container').waitFor({
				state: 'visible',
				timeout: 30_000,
			});
			const canvas = page.locator('#towerdefense-game-container canvas');
			await canvas.first().waitFor({ state: 'visible', timeout: 30_000 });
			const box = await canvas.first().boundingBox();
			expect(box).toBeTruthy();
			expect(box?.width).toBeGreaterThan(400);
			expect(box?.height).toBeGreaterThan(220);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('mounts the TD HUD shell', async () => {
		const { page, errors } = await openTdPage(browser);
		try {
			const hud = page.locator('.td-hud-mount');
			await hud.waitFor({ state: 'visible', timeout: 15_000 });
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('accepts keyboard input without page errors', async () => {
		const { page, errors } = await openTdPage(browser);
		try {
			const container = page.locator('#towerdefense-game-container');
			await container.click();
			for (const key of ['1', '2', '3', 'Escape', 'P', 'P']) {
				await page.keyboard.press(key);
				await page.waitForTimeout(80);
			}
			const canvasCount = await page
				.locator('#towerdefense-game-container canvas')
				.count();
			expect(canvasCount).toBeGreaterThanOrEqual(1);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('respects reduced-motion media without crashing', async () => {
		const page = await browser.newPage({
			viewport: { width: 1280, height: 900 },
			deviceScaleFactor: 1,
		});
		const errors = attachPageErrorCapture(page);
		try {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await gotoTd(page);
			const canvas = page.locator('#towerdefense-game-container canvas');
			const box = await canvas.first().boundingBox();
			expect(box).toBeTruthy();
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});

async function openTdPage(browser: Browser) {
	const page = await browser.newPage({
		viewport: { width: 1280, height: 900 },
		deviceScaleFactor: 1,
	});
	const errors = attachPageErrorCapture(page);
	await gotoTd(page);
	return { page, errors };
}

async function gotoTd(page: Page) {
	await page.goto(`${BASE_URL}${TOWERDEFENSE_PATH}`, {
		waitUntil: 'domcontentloaded',
		timeout: 30_000,
	});
	await page.waitForSelector('#towerdefense-game-container canvas', {
		timeout: 30_000,
	});
	await page.waitForTimeout(750);
}

function attachPageErrorCapture(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (msg) => {
		const text = msg.text();
		if (text.includes('GPU stall due to ReadPixels')) return;
		if (msg.type() === 'error' || msg.type() === 'warning') {
			errors.push(`${msg.type()}: ${text}`);
		}
	});
	page.on('pageerror', (error) => {
		errors.push(`pageerror: ${error.message}`);
	});
	return errors;
}
