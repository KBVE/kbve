import { test, expect } from '@playwright/test';

/**
 * Critical bundled assets must actually ship and serve with the right MIME —
 * the Discord Activity client (`/discord/discord.js`), the standalone embed
 * (`/embed/embed.js`), and the generated sitemap index. The JS bundles are
 * produced by separate vite builds copied through `public/` into the Astro
 * `dist/`; a broken build step yields a silent 404 (or an HTML 404 body served
 * as a script, which `nosniff` then refuses to execute). Docker-only — the
 * axum binary is what serves them.
 */
test.describe('bundled assets', () => {
	test.beforeEach(() => {
		test.skip(
			test.info().project.name !== 'docker',
			'assets are served by the axum build, not astro dev',
		);
	});

	test('Discord Activity bundle serves as executable JS', async ({
		request,
	}) => {
		const res = await request.get('/discord/discord.js');
		expect(res.status(), 'discord.js must not 404').toBe(200);
		expect(res.headers()['content-type']).toMatch(/javascript|ecmascript/);
		// nosniff would block a non-JS body; a real bundle is non-trivial.
		expect((await res.body()).length).toBeGreaterThan(1000);
	});

	test('Discord Activity index loads its script relatively', async ({
		request,
	}) => {
		const res = await request.get('/discord/');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toMatch(/html/);
		const html = await res.text();
		// Relative src so the Discord `/` -> `/discord/` mapping resolves it.
		expect(html).toMatch(/src=["']discord\.js["']/);
	});

	test('standalone embed bundle serves as executable JS', async ({
		request,
	}) => {
		const res = await request.get('/embed/embed.js');
		expect(res.status(), 'embed.js must not 404').toBe(200);
		expect(res.headers()['content-type']).toMatch(/javascript|ecmascript/);
		expect((await res.body()).length).toBeGreaterThan(1000);
	});

	test('@astrojs/sitemap index is generated', async ({ request }) => {
		// cryptothrone.com ships the sitemap as `sitemap-index.xml` (no static
		// `/sitemap.xml` redirect — that is a kbve.com-only convenience). It has
		// no robots.txt / llms.txt; those are kbve.com descriptors.
		const res = await request.get('/sitemap-index.xml');
		expect(res.status()).toBe(200);
		expect(await res.text()).toMatch(/sitemapindex|urlset/);
	});

	test('a missing nested asset returns a real 404, not a script', async ({
		request,
	}) => {
		const res = await request.get('/discord/does-not-exist.js');
		expect(res.status()).toBe(404);
	});
});
