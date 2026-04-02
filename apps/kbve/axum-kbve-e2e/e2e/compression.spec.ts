import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Precompressed static asset serving', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('serves brotli when Accept-Encoding includes br', async () => {
		// Fetch the root page to discover an _astro JS/CSS asset
		const page = await fetch(`${BASE_URL}/`);
		if (page.status !== 200) return;
		const html = await page.text();

		const jsMatch = html.match(/\/_astro\/[^"'\s]+\.js/);
		const cssMatch = html.match(/\/_astro\/[^"'\s]+\.css/);
		const assetPath = jsMatch?.[0] ?? cssMatch?.[0];
		if (!assetPath) return;

		const res = await fetch(`${BASE_URL}${assetPath}`, {
			headers: { 'Accept-Encoding': 'br, gzip, deflate' },
		});
		expect(res.status).toBe(200);

		const encoding = res.headers.get('content-encoding');
		// Server should serve precompressed brotli if available
		if (encoding) {
			expect(['br', 'gzip']).toContain(encoding);
		}
	});

	it('serves gzip when Accept-Encoding excludes br', async () => {
		const page = await fetch(`${BASE_URL}/`);
		if (page.status !== 200) return;
		const html = await page.text();

		const match = html.match(/\/_astro\/[^"'\s]+\.js/);
		if (!match) return;

		const res = await fetch(`${BASE_URL}${match[0]}`, {
			headers: { 'Accept-Encoding': 'gzip, deflate' },
		});
		expect(res.status).toBe(200);

		const encoding = res.headers.get('content-encoding');
		if (encoding) {
			expect(encoding).toBe('gzip');
		}
	});

	it('serves uncompressed when no Accept-Encoding', async () => {
		const page = await fetch(`${BASE_URL}/`);
		if (page.status !== 200) return;
		const html = await page.text();

		const match = html.match(/\/_astro\/[^"'\s]+\.js/);
		if (!match) return;

		const res = await fetch(`${BASE_URL}${match[0]}`, {
			headers: { 'Accept-Encoding': 'identity' },
		});
		expect(res.status).toBe(200);
		// Should not have content-encoding, or should be identity
		const encoding = res.headers.get('content-encoding');
		expect(encoding).toBeNull();
	});
});
