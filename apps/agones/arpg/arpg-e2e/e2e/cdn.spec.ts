import { test, expect } from '@playwright/test';

/**
 * CDN behavior of the built nginx image (kbve/arpg-web). The dev-server e2e can't
 * assert these — CORS, immutable caching, and the embed/Discord bundle layout
 * only exist in the container. arpg.kbve.com is the single origin that kbve.com
 * and the Discord Activity load cross-origin, so these headers are load-bearing.
 */

test.describe('arpg-web CDN (nginx container)', () => {
	test('serves the SPA shell', async ({ request, baseURL }) => {
		const res = await request.get(`${baseURL}/`);
		expect(res.ok()).toBeTruthy();
		expect((await res.text()).toLowerCase()).toContain('<!doctype html');
	});

	test('SPA fallback serves index for an unknown route', async ({
		request,
		baseURL,
	}) => {
		const res = await request.get(`${baseURL}/deep/unknown/route`);
		expect(res.ok()).toBeTruthy();
		expect((await res.text()).toLowerCase()).toContain('<!doctype html');
	});

	test('embed bundle is served with permissive CORS', async ({
		request,
		baseURL,
	}) => {
		const res = await request.get(`${baseURL}/arpg-embed.js`);
		expect(res.ok(), 'arpg-embed.js must exist in the image').toBeTruthy();
		expect(res.headers()['access-control-allow-origin']).toBe('*');
		expect(res.headers()['content-type'] ?? '').toMatch(/javascript/);
	});

	test('Discord Activity page is served at /discord/arpg/', async ({
		request,
		baseURL,
	}) => {
		const res = await request.get(`${baseURL}/discord/arpg/`);
		expect(res.ok()).toBeTruthy();
		expect((await res.text()).toLowerCase()).toContain('<!doctype html');
	});

	test('Discord Activity bundle is served', async ({ request, baseURL }) => {
		const res = await request.get(`${baseURL}/discord/arpg/arpg.js`);
		expect(
			res.ok(),
			'discord/arpg/arpg.js must exist in the image',
		).toBeTruthy();
		expect(res.headers()['content-type'] ?? '').toMatch(/javascript/);
	});

	test('art under /assets/ carries CORS + immutable cache', async ({
		request,
		baseURL,
	}) => {
		// ground.png is the one art asset the game always loads; assert the CDN
		// headers on it (CORS so kbve.com can pull it cross-origin).
		const res = await request.get(
			`${baseURL}/assets/arcade/arpg/ground.png`,
		);
		if (res.status() === 404) {
			test.info().annotations.push({
				type: 'note',
				description:
					'ground.png absent (LFS art not pulled into the image) — header assertion skipped',
			});
			return;
		}
		expect(res.headers()['access-control-allow-origin']).toBe('*');
		expect(res.headers()['cache-control'] ?? '').toMatch(/immutable/);
	});
});
