import { test, expect } from '@playwright/test';

test.describe('Smoke: Pagefind Search', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');
	});

	test('search modal opens and pagefind-ui mounts', async ({ page }) => {
		const trigger = page.locator('button[data-open-modal]');
		await expect(trigger).toBeVisible({ timeout: 10_000 });
		await trigger.click();

		const dialog = page.locator('dialog[aria-label="Search"]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		const input = dialog.locator('.pagefind-ui__search-input');
		await expect(input).toBeVisible({ timeout: 10_000 });
	});

	test('searching "memes" returns results', async ({ page }) => {
		await page.locator('button[data-open-modal]').click();

		const dialog = page.locator('dialog[aria-label="Search"]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		const input = dialog.locator('.pagefind-ui__search-input');
		await expect(input).toBeVisible({ timeout: 10_000 });
		await input.pressSequentially('memes', { delay: 50 });

		const results = dialog.locator('.pagefind-ui__result');
		await expect(results.first()).toBeVisible({ timeout: 15_000 });

		const count = await results.count();
		expect(count).toBeGreaterThan(0);
	});

	test('clicking a search result navigates to a valid page', async ({
		page,
	}) => {
		await page.locator('button[data-open-modal]').click();

		const dialog = page.locator('dialog[aria-label="Search"]');
		const input = dialog.locator('.pagefind-ui__search-input');
		await expect(input).toBeVisible({ timeout: 10_000 });
		await input.pressSequentially('memes', { delay: 50 });

		const firstResult = dialog.locator('.pagefind-ui__result a').first();
		await expect(firstResult).toBeVisible({ timeout: 15_000 });

		const href = await firstResult.getAttribute('href');
		expect(href).toBeTruthy();

		await firstResult.click();
		await page.waitForURL(`**${href!}`, { timeout: 10_000 });

		expect(page.url()).toContain(href!);
	});
});
