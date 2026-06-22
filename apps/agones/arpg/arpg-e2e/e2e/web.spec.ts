import { test, expect } from '@playwright/test';

test.describe('arpg-web: static app', () => {
	test('serves the SPA shell at /', async ({ page }) => {
		const res = await page.goto('/');
		expect(res?.ok()).toBeTruthy();
		await expect(page).toHaveTitle(/.+/);
	});

	test('mounts a root container', async ({ page }) => {
		await page.goto('/');
		const root = page.locator('#root, #arpg-root, [data-arpg-root]');
		await expect(root.first()).toBeAttached();
	});

	test('SPA fallback serves index for an unknown route', async ({
		request,
		baseURL,
	}) => {
		const res = await request.get(`${baseURL}/some/deep/route`);
		expect(res.ok()).toBeTruthy();
		expect((await res.text()).toLowerCase()).toContain('<!doctype html');
	});

	test('no uncaught console errors during boot', async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (m) => {
			if (m.type() === 'error') errors.push(m.text());
		});
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto('/', { waitUntil: 'networkidle' });
		const fatal = errors.filter(
			(e) =>
				!/favicon|404|net::ERR|WebSocket|font|sprite|\.png|\.webp/i.test(
					e,
				),
		);
		expect(fatal, fatal.join('\n')).toHaveLength(0);
	});
});
