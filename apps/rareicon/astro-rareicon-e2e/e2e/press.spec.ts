import { test, expect } from '@playwright/test';

test.describe('Press kit', () => {
	test('press page loads with 200 + RareIcon-press title', async ({
		page,
	}) => {
		const response = await page.goto('/press/');
		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle(/Press|RareIcon/);
	});

	test('fact sheet renders developer / publisher / genre rows', async ({
		page,
	}) => {
		await page.goto('/press/');
		const facts = page.locator('.ri-press__facts');
		await expect(facts).toBeVisible();
		await expect(facts).toContainText('Developer');
		await expect(facts).toContainText('Publisher');
		await expect(facts).toContainText('Genre');
	});

	test('pitch quote present', async ({ page }) => {
		await page.goto('/press/');
		const blockquote = page.locator('.ri-press blockquote').first();
		await expect(blockquote).toBeVisible();
		await expect(blockquote).toContainText(/Chip|RareIcon|bullet/i);
	});

	test('SocialBar cards rendered under Follow Along', async ({ page }) => {
		await page.goto('/press/');
		const socialbar = page
			.locator('.ri-socialbar.ri-socialbar--cards')
			.first();
		await expect(socialbar).toBeVisible();
		// Press kit should surface at least 3 platform cards
		const items = socialbar.locator('.ri-socialbar__item');
		expect(await items.count()).toBeGreaterThanOrEqual(3);
	});

	test('contact emails render in body copy', async ({ page }) => {
		await page.goto('/press/');
		const body = page.locator('.ri-press');
		await expect(body).toContainText('press@kbve.com');
		await expect(body).toContainText('creators@kbve.com');
	});
});

test.describe('Press kit OG meta override', () => {
	test('og:title carries Press Kit override copy', async ({ page }) => {
		await page.goto('/press/');
		const ogTitle = await page
			.locator('meta[property="og:title"]')
			.getAttribute('content');
		expect(ogTitle).toBeTruthy();
		expect(ogTitle).toMatch(/Press Kit|RareIcon/i);
	});

	test('og:description carries override (not raw frontmatter description)', async ({
		page,
	}) => {
		await page.goto('/press/');
		const ogDesc = await page
			.locator('meta[property="og:description"]')
			.getAttribute('content');
		expect(ogDesc).toBeTruthy();
		expect(ogDesc?.length).toBeGreaterThan(40);
	});

	test('og:image points at the public asset path', async ({ page }) => {
		await page.goto('/press/');
		const ogImg = await page
			.locator('meta[property="og:image"]')
			.getAttribute('content');
		expect(ogImg).toMatch(
			/^https?:\/\/.+\/(assets|branding)\/.+\.(png|jpg|svg)$/i,
		);
	});
});
