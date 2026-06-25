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

	const ART_ASSETS = [
		'/assets/arcade/arpg/ground.png',
		'/assets/arcade/arpg/ui/panel-gold.png',
		'/assets/arcade/arpg/ui/cursor/glove3.png',
		'/assets/arcade/arpg/characters/ranger/Idle_Bow/Idle_Bow_Body_000.webp',
		'/assets/arcade/arpg/creatures/wyvern/wyvern_fire.webp',
		'/assets/arcade/arpg/environment/hazards/campfire/campfire-Sheet.png',
	];

	for (const path of ART_ASSETS) {
		const webp = path.endsWith('.webp');
		test(`art is a real ${webp ? 'WebP' : 'PNG'}, not an LFS pointer: ${path}`, async ({
			request,
			baseURL,
		}) => {
			const res = await request.get(`${baseURL}${path}`);
			expect(res.status(), `${path} must exist`).toBe(200);

			const body = await res.body();
			if (webp) {
				// RIFF....WEBP container header — a pointer stub is text ("version ...").
				expect(
					body.subarray(0, 4).toString('hex'),
					`${path} is not a real WebP (likely an LFS pointer stub)`,
				).toBe('52494646');
				expect(body.subarray(8, 12).toString('hex')).toBe('57454250');
				expect(res.headers()['content-type'] ?? '').toMatch(
					/image\/webp/,
				);
			} else {
				expect(
					body.subarray(0, 4).toString('hex'),
					`${path} is not a real PNG (likely an LFS pointer stub)`,
				).toBe('89504e47');
				expect(res.headers()['content-type'] ?? '').toMatch(
					/image\/png/,
				);
			}
			expect(res.headers()['access-control-allow-origin']).toBe('*');
			expect(res.headers()['cache-control'] ?? '').toMatch(/immutable/);
		});
	}
});
