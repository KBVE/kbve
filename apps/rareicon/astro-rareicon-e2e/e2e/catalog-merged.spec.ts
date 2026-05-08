import { test, expect } from '@playwright/test';
import {
	BRAND_ICON_ROUTES,
	MULTI_SOURCE_ICON_ROUTES,
	ATTRIBUTION_REQUIRED_ROUTES,
} from './helpers/routes';

/**
 * Coverage for the codegen pipeline's merger output:
 *   - Multi-source merged terms render the badge with a non-zero source count
 *   - License footer renders for every generated/hand-crafted term
 *   - Attribution-required terms render the gold "Attribution required" callout
 *   - Brand-source terms (CC0 Simple Icons) skip the callout
 */

test.describe('Multi-source merged terms', () => {
	for (const route of MULTI_SOURCE_ICON_ROUTES) {
		test(`${route.label} renders multi-source badge`, async ({ page }) => {
			await page.goto(route.path);
			const badge = page.locator('.ri-icon-term__multi-source');
			await expect(badge).toBeVisible();
			await expect(badge).toContainText(/variants? merged from/i);
		});

		test(`${route.label} variant grid has 2+ entries`, async ({ page }) => {
			await page.goto(route.path);
			const variants = page.locator('.ri-icon-variant');
			expect(await variants.count()).toBeGreaterThanOrEqual(2);
		});
	}
});

test.describe('License footer', () => {
	for (const route of [
		...BRAND_ICON_ROUTES,
		...ATTRIBUTION_REQUIRED_ROUTES,
	]) {
		test(`${route.label} renders license footer`, async ({ page }) => {
			await page.goto(route.path);
			const license = page.locator('.ri-icon-term__license');
			await expect(license).toBeVisible();
		});

		test(`${route.label} surfaces a source page link`, async ({ page }) => {
			await page.goto(route.path);
			const link = page.locator('.ri-icon-term__license-link');
			await expect(link).toBeVisible();
			const href = await link.getAttribute('href');
			expect(href).toMatch(/^https?:\/\//);
		});
	}
});

test.describe('Attribution-required UI (CC BY)', () => {
	for (const route of ATTRIBUTION_REQUIRED_ROUTES) {
		test(`${route.label} renders gold Attribution required callout`, async ({
			page,
		}) => {
			await page.goto(route.path);
			const required = page.locator('.ri-icon-term__license--required');
			await expect(required).toBeVisible();
			await expect(required).toContainText(/Attribution required/i);
		});
	}
});

test.describe('Brand glyph terms (no attribution required)', () => {
	for (const route of BRAND_ICON_ROUTES) {
		test(`${route.label} omits Attribution required callout`, async ({
			page,
		}) => {
			await page.goto(route.path);
			// Footer present (CC0 still surfaces a "License" header) but
			// not the gold attribution-required variant
			const required = page.locator('.ri-icon-term__license--required');
			await expect(required).toHaveCount(0);
		});
	}
});
