import { test, expect } from '@playwright/test';
import { FOOTER_EXTERNAL_LINKS } from './helpers/routes';

test.describe('homepage hero', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('renders the hero label, title and tagline', async ({ page }) => {
		await expect(page.locator('.ct-hero__label')).toHaveText(
			/Browser-Based RPG/i,
		);
		const title = page.locator('.ct-hero__title');
		await expect(title).toBeVisible();
		await expect(title).toContainText('Throne');
		await expect(page.locator('.ct-hero__tagline')).not.toBeEmpty();
	});

	test('hero CTAs point at the game and guides', async ({ page }) => {
		const play = page.locator('.ct-hero__actions a', {
			hasText: 'Play Now',
		});
		const guides = page.locator('.ct-hero__actions a', {
			hasText: 'View Guides',
		});
		await expect(play).toHaveAttribute('href', '/game/play/');
		await expect(guides).toHaveAttribute(
			'href',
			'/guides/getting-started/',
		);
	});

	test('Play Now navigates to the game page', async ({ page }) => {
		await page
			.locator('.ct-hero__actions a', { hasText: 'Play Now' })
			.click();
		await expect(page).toHaveURL(/\/game\/play\/$/);
	});
});

test.describe('homepage sections', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('feature grid renders a heading and multiple cards', async ({
		page,
	}) => {
		await expect(page.locator('.ct-features__heading')).toHaveText(
			/Game Features/i,
		);
		const cards = page.locator('.ct-card');
		expect(await cards.count()).toBeGreaterThanOrEqual(3);
	});

	test('stats bar renders quote and stat items', async ({ page }) => {
		await expect(page.locator('.ct-stats__quote')).toBeVisible();
		const items = page.locator('.ct-stats__item');
		expect(await items.count()).toBeGreaterThanOrEqual(1);
	});

	test('CTA section heading and primary action', async ({ page }) => {
		await expect(page.locator('.ct-cta__heading')).toHaveText(
			/Enter the Cloud Cities/i,
		);
		await expect(page.locator('.ct-cta__btn--primary')).toHaveAttribute(
			'href',
			'/game/play/',
		);
	});
});

test.describe('footer', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('brand link returns home', async ({ page }) => {
		await expect(page.locator('.ct-footer__brand-link')).toHaveAttribute(
			'href',
			'/',
		);
	});

	test('adventure column links to game and guides', async ({ page }) => {
		const footer = page.locator('.ct-footer');
		await expect(
			footer.locator('a[href="/game/play/"]').first(),
		).toBeVisible();
		await expect(
			footer.locator('a[href="/guides/getting-started/"]').first(),
		).toBeVisible();
	});

	test('all external footer links are present with safe targets', async ({
		page,
	}) => {
		const footer = page.locator('.ct-footer');
		for (const href of FOOTER_EXTERNAL_LINKS) {
			await expect(
				footer.locator(`a[href="${href}"]`).first(),
			).toBeAttached();
		}
	});
});
