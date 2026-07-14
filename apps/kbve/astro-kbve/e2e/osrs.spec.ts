import { test, expect } from '@playwright/test';

const OSRS_URL = '/osrs/';
const ROW_SEL = '[data-osrs-row]';

test.describe('osrs item browser — list loads', () => {
	test('virtualized list renders rows', async ({ page }) => {
		await page.goto(OSRS_URL, { waitUntil: 'load' });
		const firstRow = page.locator(ROW_SEL).first();
		await expect(firstRow).toBeVisible({ timeout: 30_000 });
		const count = await page.locator(ROW_SEL).count();
		expect(count).toBeGreaterThan(0);
	});

	test('search input filters the list', async ({ page }) => {
		await page.goto(OSRS_URL, { waitUntil: 'load' });
		await expect(page.locator(ROW_SEL).first()).toBeVisible({
			timeout: 30_000,
		});

		const search = page.getByPlaceholder(/Search by name/i);
		await expect(search).toBeVisible();
		await search.fill('whip');
		// At least one whip-named row should still be present; the
		// counter line says "N of M items".
		await expect(page.locator(ROW_SEL).first()).toBeVisible({
			timeout: 10_000,
		});
		const text = await page.locator(ROW_SEL).first().innerText();
		expect(text.toLowerCase()).toContain('whip');
	});
});

test.describe('osrs item browser — tap navigates (Safari regression)', () => {
	test('tapping a row navigates to its detail page', async ({ page }) => {
		await page.goto(OSRS_URL, { waitUntil: 'load' });
		const firstRow = page.locator(ROW_SEL).first();
		await expect(firstRow).toBeVisible({ timeout: 30_000 });

		const slug = await firstRow.getAttribute('data-osrs-slug');
		expect(slug).toBeTruthy();
		const expectedPath = `/osrs/${slug}/`;

		// `click()` in Playwright dispatches a real touch event on the
		// mobile-safari / mobile-chrome projects, so this is the same
		// failure mode the user reported on iPhone Safari.
		await Promise.all([
			page.waitForURL(`**${expectedPath}`, { timeout: 15_000 }),
			firstRow.click(),
		]);

		expect(page.url()).toContain(expectedPath);
	});

	test('row has touchAction=manipulation + cursor=pointer (Safari tap fix)', async ({
		page,
	}) => {
		await page.goto(OSRS_URL, { waitUntil: 'load' });
		const firstRow = page.locator(ROW_SEL).first();
		await expect(firstRow).toBeVisible({ timeout: 30_000 });

		const styles = await firstRow.evaluate((el) => {
			const cs = getComputedStyle(el as HTMLElement);
			return {
				touchAction: cs.touchAction,
				cursor: cs.cursor,
			};
		});
		expect(styles.touchAction).toBe('manipulation');
		expect(styles.cursor).toBe('pointer');
	});

	test('row anchor has a non-empty href (Safari requires real href to tap)', async ({
		page,
	}) => {
		await page.goto(OSRS_URL, { waitUntil: 'load' });
		const firstRow = page.locator(ROW_SEL).first();
		await expect(firstRow).toBeVisible({ timeout: 30_000 });

		const href = await firstRow.getAttribute('href');
		expect(href).toMatch(/^\/osrs\/.+\/$/);
		const tag = await firstRow.evaluate((el) => el.tagName);
		expect(tag).toBe('A');
	});
});

test.describe('osrs item browser — filter UI', () => {
	test('changing tag filter updates the rendered rows', async ({ page }) => {
		await page.goto(OSRS_URL, { waitUntil: 'load' });
		await expect(page.locator(ROW_SEL).first()).toBeVisible({
			timeout: 30_000,
		});

		const tagSelect = page
			.locator('select')
			.filter({ has: page.locator('option', { hasText: 'All' }) })
			.first();
		await tagSelect.selectOption('food');
		await expect(page.locator(ROW_SEL).first()).toBeVisible({
			timeout: 10_000,
		});
	});
});
