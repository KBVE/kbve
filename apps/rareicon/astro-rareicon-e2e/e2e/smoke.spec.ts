import { test, expect } from '@playwright/test';
import { CONTENT_ROUTES, ICON_ROUTES, SPLASH_ROUTES } from './helpers/routes';

test.describe('astro-rareicon smoke tests', () => {
	test('homepage loads with 200 and has RareIcon title', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle(/RareIcon/);
	});

	test('hero renders with primary CTA', async ({ page }) => {
		await page.goto('/');
		const heroCta = page.locator('.ri-hero__actions a').first();
		await expect(heroCta).toBeVisible();
	});

	for (const route of SPLASH_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	for (const route of CONTENT_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	for (const route of ICON_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}
});

test.describe('Steam landing', () => {
	test('steam page embeds Steam widget iframe', async ({ page }) => {
		await page.goto('/steam/');
		const iframe = page.locator('iframe[src*="store.steampowered.com"]');
		await expect(iframe).toBeAttached();
	});

	test('steam page has wishlist CTA link', async ({ page }) => {
		await page.goto('/steam/');
		const cta = page
			.locator('a.ri-steam-cta__link')
			.or(page.locator('a[href*="store.steampowered.com"]'))
			.first();
		await expect(cta).toBeVisible();
	});
});

test.describe('Icon library', () => {
	test('library page renders browser island', async ({ page }) => {
		await page.goto('/icons/');
		const browser = page.locator('.ri-icons-browser');
		await expect(browser).toBeVisible({ timeout: 10_000 });
	});

	test('sword term page renders variant grid', async ({ page }) => {
		await page.goto('/icons/sword/');
		const grid = page.locator('.ri-icon-term__grid');
		await expect(grid).toBeVisible();

		const variants = page.locator('.ri-icon-variant');
		await expect(variants.first()).toBeVisible();
	});

	test('sword term page offers Copy SVG button per variant', async ({
		page,
	}) => {
		await page.goto('/icons/sword/');
		const copyBtn = page.locator('.ri-icon-variant__copy').first();
		await expect(copyBtn).toBeVisible();
		await expect(copyBtn).toHaveText(/Copy SVG/);
	});
});

test.describe('sidebar + search', () => {
	test('sidebar contains Icons section', async ({ page }) => {
		await page.goto('/');
		const sidebar = page.locator('nav[aria-label="Main"]');
		await expect(sidebar).toBeAttached();
		await expect(sidebar.locator('a[href="/icons/"]')).toBeAttached();
	});

	test('Pagefind search trigger present', async ({ page }) => {
		await page.goto('/');
		const trigger = page.locator('button[data-open-modal]');
		await expect(trigger).toBeVisible({ timeout: 10_000 });
	});
});
