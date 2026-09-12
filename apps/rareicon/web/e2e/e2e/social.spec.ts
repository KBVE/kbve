import { test, expect } from '@playwright/test';

/**
 * Coverage for the SocialBar component, footer routing, and per-page
 * `og:title` / `og:description` overrides shipped in earlier phases.
 */

test.describe('Footer SocialBar', () => {
	test('homepage footer renders SocialBar badges', async ({ page }) => {
		await page.goto('/');
		const badges = page.locator('.ri-socialbar.ri-socialbar--badges');
		await expect(badges).toBeVisible();
		const items = badges.locator('.ri-socialbar__item');
		expect(await items.count()).toBeGreaterThanOrEqual(5);
	});

	test('Steam badge links to internal /steam/ (in-house SEO)', async ({
		page,
	}) => {
		await page.goto('/');
		const steam = page
			.locator('.ri-socialbar__item[data-platform="steam"]')
			.first();
		const href = await steam.getAttribute('href');
		expect(href).toMatch(/^\/steam\/?$/);
	});

	test('Discord badge routes through kbve.com (UTM-tagged)', async ({
		page,
	}) => {
		await page.goto('/');
		const discord = page
			.locator('.ri-socialbar__item[data-platform="discord"]')
			.first();
		const href = await discord.getAttribute('href');
		expect(href).toContain('kbve.com/discord');
		expect(href).toContain('utm_source=rareicon');
		expect(href).toContain('utm_campaign=footer');
	});
});

test.describe('Steam page SocialBar', () => {
	test('steam page renders cards-variant SocialBar excluding self', async ({
		page,
	}) => {
		await page.goto('/steam/');
		const cards = page.locator('.ri-socialbar.ri-socialbar--cards').first();
		await expect(cards).toBeVisible();
		// Steam excluded from this surface — own page already linked above
		const steam = cards.locator('[data-platform="steam"]');
		await expect(steam).toHaveCount(0);
	});

	test('steam page SocialBar tags utm_campaign=steam-page', async ({
		page,
	}) => {
		await page.goto('/steam/');
		const discord = page
			.locator(
				'.ri-socialbar.ri-socialbar--cards [data-platform="discord"]',
			)
			.first();
		const href = await discord.getAttribute('href');
		expect(href).toContain('utm_campaign=steam-page');
	});
});

test.describe('Per-page og:* overrides', () => {
	test('homepage og:title carries override copy', async ({ page }) => {
		await page.goto('/');
		const ogTitle = await page
			.locator('meta[property="og:title"]')
			.getAttribute('content');
		expect(ogTitle).toMatch(/Bullet-Hell|RareIcon/i);
	});

	test('steam page og:title pushes wishlist copy', async ({ page }) => {
		await page.goto('/steam/');
		const ogTitle = await page
			.locator('meta[property="og:title"]')
			.getAttribute('content');
		expect(ogTitle).toMatch(/Wishlist|Steam/i);
	});

	test('press page og:description differs from default', async ({ page }) => {
		await page.goto('/press/');
		const ogDesc = await page
			.locator('meta[property="og:description"]')
			.getAttribute('content');
		expect(ogDesc).toMatch(/press|streamers|content creators|coverage/i);
	});

	test('twitter:image fallback to global default when no per-page override', async ({
		page,
	}) => {
		await page.goto('/');
		const twImg = await page
			.locator('meta[name="twitter:image"]')
			.getAttribute('content');
		expect(twImg).toBeTruthy();
		expect(twImg).toMatch(/^https?:\/\//);
	});

	test('twitter:card defaults to summary_large_image', async ({ page }) => {
		await page.goto('/');
		const twCard = await page
			.locator('meta[name="twitter:card"]')
			.getAttribute('content');
		expect(twCard).toBe('summary_large_image');
	});
});

test.describe('Footer Kingdom nav routes through kbve.com', () => {
	const platforms = [
		'github',
		'discord',
		'youtube',
		'twitch',
		'twitter',
		'bluesky',
		'tiktok',
		'itch',
	];

	for (const platform of platforms) {
		test(`${platform} link routes through kbve.com`, async ({ page }) => {
			await page.goto('/');
			const link = page
				.locator(`.ri-footer__col a[href*="kbve.com/${platform}"]`)
				.first();
			await expect(link).toBeAttached();
		});
	}
});
