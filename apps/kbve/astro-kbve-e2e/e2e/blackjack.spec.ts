import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { BASE_URL, waitForReady } from './helpers/http';

const BLACKJACK_PATH = '/arcade/blackjack/';

describe('Blackjack arcade smoke', () => {
	let browser: Browser;

	beforeAll(async () => {
		await waitForReady();
		browser = await chromium.launch({ headless: true });
	});

	afterAll(async () => {
		await browser?.close();
	});

	it('serves the blackjack arcade route', async () => {
		const res = await fetch(`${BASE_URL}${BLACKJACK_PATH}`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('data-blackjack-stage');
		expect(body).toContain('Theater');
		expect(body).toContain('Fullscreen');
	});

	it('renders the Phaser canvas and toolbar controls', async () => {
		const { page, errors } = await openBlackjackPage(browser);
		try {
			const canvasBox = await page.locator('canvas').boundingBox();
			expect(canvasBox).toBeTruthy();
			expect(canvasBox?.width).toBeGreaterThan(300);
			expect(canvasBox?.height).toBeGreaterThan(180);
			expect(
				await page
					.locator('[data-blackjack-theater]')
					.getAttribute('aria-pressed'),
			).toBe('false');
			expect(
				await page
					.locator('[data-blackjack-fullscreen]')
					.getAttribute('aria-pressed'),
			).toBe('false');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('accepts a keyboard gameplay flow without page errors', async () => {
		const { page, errors } = await openBlackjackPage(browser);
		try {
			await page.locator('.blackjack-frame').click();
			for (const key of ['Enter', 'H', 'S', 'Enter', 'Enter']) {
				await page.keyboard.press(key);
				await page.waitForTimeout(300);
			}

			const canvasCount = await page.locator('canvas').count();
			expect(canvasCount).toBe(1);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('toggles theater mode and exits with Escape', async () => {
		const { page, errors } = await openBlackjackPage(browser);
		try {
			const stage = page.locator('[data-blackjack-stage]');
			const theater = page.locator('[data-blackjack-theater]');
			await theater.click();
			await expectClass(stage, 'is-theater', true);
			expect(await theater.getAttribute('aria-pressed')).toBe('true');

			await page.keyboard.press('Escape');
			await expectClass(stage, 'is-theater', false);
			expect(await theater.getAttribute('aria-pressed')).toBe('false');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('runs the deal flow with reduced motion enabled', async () => {
		const page = await browser.newPage({
			viewport: { width: 1280, height: 900 },
			deviceScaleFactor: 1,
		});
		const errors = attachPageErrorCapture(page);
		try {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await gotoBlackjack(page);
			await page.locator('.blackjack-frame').click();
			await page.keyboard.press('Enter');
			await page.waitForTimeout(300);

			const canvasBox = await page.locator('canvas').boundingBox();
			expect(canvasBox).toBeTruthy();
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});

async function openBlackjackPage(browser: Browser) {
	const page = await browser.newPage({
		viewport: { width: 1280, height: 900 },
		deviceScaleFactor: 1,
	});
	const errors = attachPageErrorCapture(page);
	await gotoBlackjack(page);
	return { page, errors };
}

async function gotoBlackjack(page: Page) {
	await page.goto(`${BASE_URL}${BLACKJACK_PATH}`, {
		waitUntil: 'domcontentloaded',
		timeout: 30_000,
	});
	await page.waitForSelector('canvas', { timeout: 30_000 });
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

async function expectClass(
	locator: ReturnType<Page['locator']>,
	className: string,
	expected: boolean,
) {
	const classes = (await locator.getAttribute('class')) ?? '';
	expect(classes.split(/\s+/).includes(className)).toBe(expected);
}
