import { test, expect } from '@playwright/test';
import { isMobileViewport } from './helpers/env';

test.describe('primary header navigation (desktop)', () => {
	test.beforeEach(async ({ page }) => {
		test.skip(
			await isMobileViewport(page),
			'header nav is collapsed on mobile',
		);
		await page.goto('/');
	});

	test('exposes Home, Play, Guides and KBVE links', async ({ page }) => {
		const nav = page.locator('nav.ct-nav');
		await expect(nav.locator('a', { hasText: 'Home' })).toHaveAttribute(
			'href',
			'/',
		);
		await expect(nav.locator('a', { hasText: 'Play' })).toHaveAttribute(
			'href',
			'/game/play/',
		);
		await expect(nav.locator('a', { hasText: 'Guides' })).toHaveAttribute(
			'href',
			'/guides/getting-started/',
		);
		await expect(nav.locator('a', { hasText: 'KBVE' })).toHaveAttribute(
			'href',
			'https://kbve.com',
		);
	});

	test('Guides link routes to the getting-started page', async ({ page }) => {
		await page.locator('nav.ct-nav a', { hasText: 'Guides' }).click();
		await expect(page).toHaveURL(/\/guides\/getting-started\/$/);
		await expect(page.locator('h1')).toBeVisible();
	});
});

test.describe('sidebar navigation', () => {
	test('Starlight sidebar links Game and Guides on content pages', async ({
		page,
	}) => {
		await page.goto('/guides/getting-started/');
		const sidebar = page.locator('nav[aria-label="Main"]');
		await expect(sidebar).toBeAttached();
		await expect(sidebar.locator('a[href="/game/play/"]')).toBeAttached();
		await expect(
			sidebar.locator('a[href="/guides/getting-started/"]'),
		).toBeAttached();
	});
});

test.describe('error handling', () => {
	test('unknown route returns 404', async ({ page }) => {
		const response = await page.goto('/this-route-does-not-exist/');
		expect(response?.status()).toBe(404);
	});
});
