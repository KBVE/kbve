import { test, expect } from '@playwright/test';
import {
	ATTRIBUTION_REQUIRED_ROUTES,
	BRAND_ICON_ROUTES,
	CONTENT_ROUTES,
	ICON_ROUTES,
	MULTI_SOURCE_ICON_ROUTES,
	SPLASH_ROUTES,
} from './helpers/routes';

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

	for (const route of BRAND_ICON_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	for (const route of MULTI_SOURCE_ICON_ROUTES) {
		test(`${route.label} loads with 200`, async ({ page }) => {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
		});
	}

	for (const route of ATTRIBUTION_REQUIRED_ROUTES) {
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
		const copyBtn = page
			.locator('.ri-icon-variant__copy[data-copy-format="svg"]')
			.first();
		await expect(copyBtn).toBeVisible();
		await expect(copyBtn).toHaveText('SVG');
		await expect(copyBtn).toHaveAttribute('data-copy-svg', /<svg/i);
	});

	test('copy controls write SVG payloads and surface copied state', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				value: {
					writeText: (text: string) => {
						window.localStorage.setItem('rareicon:last-copy', text);
						return Promise.resolve();
					},
				},
				configurable: true,
			});
		});

		await page.goto('/icons/sword/');
		const copyBtn = page
			.locator('.ri-icon-variant__copy[data-copy-format="svg"]')
			.first();
		await copyBtn.click();

		await expect(copyBtn).toHaveAttribute('data-copied', 'true');
		await expect(copyBtn).toHaveText('Copied');

		const copied = await page.evaluate(() =>
			window.localStorage.getItem('rareicon:last-copy'),
		);
		expect(copied).toContain('<svg');
	});
});

test.describe('sidebar + search', () => {
	test('sidebar contains Icons section', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('a[href="/icons/"]').first()).toBeVisible();
	});

	test('Pagefind search trigger present', async ({ page }) => {
		await page.goto('/');
		const trigger = page.locator('button[data-open-modal]');
		await expect(trigger).toBeVisible({ timeout: 10_000 });
	});

	test('icon browser filters by direct search query', async ({ page }) => {
		await page.goto('/icons/');
		const search = page.getByRole('searchbox', { name: 'Search icons' });
		await expect(search).toBeVisible({ timeout: 10_000 });

		await search.fill('docker');

		const card = page.locator(
			'.ri-icons-browser__card[href="/icons/docker/"]',
		);
		await expect(card).toBeVisible();
		await expect(page.locator('.ri-icons-browser__empty')).toHaveCount(0);
	});

	test('icon browser exposes multi-source and attribution filters', async ({
		page,
	}) => {
		await page.goto('/icons/');

		const multiSource = page.getByRole('button', {
			name: 'Multi-source only',
		});
		const attribution = page.getByRole('button', {
			name: 'Attribution required (CC BY)',
		});

		await multiSource.click();
		await expect(multiSource).toHaveAttribute('aria-pressed', 'true');
		await expect(
			page.locator('.ri-icons-browser__card[href="/icons/python/"]'),
		).toBeVisible();

		await multiSource.click();
		await attribution.click();
		await expect(multiSource).toHaveAttribute('aria-pressed', 'false');
		await expect(attribution).toHaveAttribute('aria-pressed', 'true');

		await page
			.getByRole('searchbox', { name: 'Search icons' })
			.fill('broadsword');
		await expect(
			page.locator('.ri-icons-browser__card[href="/icons/broadsword/"]'),
		).toBeVisible();
	});
});
