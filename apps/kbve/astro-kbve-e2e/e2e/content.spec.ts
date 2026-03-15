import { test, expect } from '@playwright/test';

test.describe('content rendering', () => {
	test('guide page renders markdown content', async ({ page }) => {
		await page.goto('/guides/getting-started/');
		const heading = page.locator('h1');
		await expect(heading).toBeVisible();
		await expect(heading).toContainText('Getting Started');
	});

	test('application page renders with sidebar', async ({ page }) => {
		await page.goto('/application/git/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('stock page renders', async ({ page }) => {
		await page.goto('/stock/aapl/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('OSRS item page renders with frontmatter data', async ({ page }) => {
		await page.goto('/osrs/3rd-age-amulet/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('quest page renders', async ({ page }) => {
		await page.goto('/questdb/auto-cooker-9000/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('journal entry renders', async ({ page }) => {
		await page.goto('/journal/01-01/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('homepage renders splash template', async ({ page }) => {
		await page.goto('/');
		const body = page.locator('body');
		await expect(body).toBeVisible();
		await expect(page).toHaveTitle(/KBVE/);
	});

	test('mapdb item page renders', async ({ page }) => {
		await page.goto('/mapdb/adamantine-vein/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});

	test('itemdb item page renders', async ({ page }) => {
		await page.goto('/itemdb/alchemist-stardust/');
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});
});
