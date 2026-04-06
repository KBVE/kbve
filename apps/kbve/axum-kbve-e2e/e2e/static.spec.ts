import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Static file serving', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('serves the root path with HTML', async () => {
		const res = await fetch(`${BASE_URL}/`);
		// Root should serve either static index or redirect
		expect([200, 301, 302, 304]).toContain(res.status);
	});

	it('returns security headers on responses', async () => {
		const res = await fetch(`${BASE_URL}/health`);

		const xContentType = res.headers.get('x-content-type-options');
		expect(xContentType).toBe('nosniff');

		const xFrame = res.headers.get('x-frame-options');
		expect(xFrame).toBe('DENY');
	});

	it('serves favicon.svg if it exists', async () => {
		const res = await fetch(`${BASE_URL}/favicon.svg`);
		// Static asset may or may not exist in the dist
		if (res.status === 200) {
			const contentType = res.headers.get('content-type') ?? '';
			expect(contentType).toContain('svg');
		}
	});

	it('returns 404 for non-existent static paths', async () => {
		const res = await fetch(
			`${BASE_URL}/definitely-not-a-real-page-12345.html`,
		);
		expect(res.status).toBe(404);
	});

	it('returns COOP/COEP headers on /arcade/isometric/ for SharedArrayBuffer', async () => {
		const res = await fetch(`${BASE_URL}/arcade/isometric/`);
		if (res.status === 200) {
			expect(res.headers.get('cross-origin-opener-policy')).toBe(
				'same-origin',
			);
			// require-corp used instead of credentialless for Safari SharedArrayBuffer support
			expect(res.headers.get('cross-origin-embedder-policy')).toBe(
				'require-corp',
			);
		}
	});

	it('returns COOP/COEP headers on /isometric/ asset paths', async () => {
		const res = await fetch(`${BASE_URL}/isometric/wasm-worker.js`);
		if (res.status === 200) {
			expect(res.headers.get('cross-origin-opener-policy')).toBe(
				'same-origin',
			);
			// require-corp used instead of credentialless for Safari SharedArrayBuffer support
			expect(res.headers.get('cross-origin-embedder-policy')).toBe(
				'require-corp',
			);
		}
	});

	it('returns CORP header on /_astro/ assets for COEP compatibility', async () => {
		// Fetch the arcade page to discover an _astro asset path
		const page = await fetch(`${BASE_URL}/arcade/isometric/`);
		if (page.status !== 200) return;
		const html = await page.text();
		const match = html.match(/\/_astro\/[^"'\s]+\.js/);
		if (!match) return;
		const astroAsset = match[0];
		const res = await fetch(`${BASE_URL}${astroAsset}`);
		if (res.status === 200) {
			expect(res.headers.get('cross-origin-resource-policy')).toBe(
				'same-origin',
			);
		}
	});

	it('supports precompressed content via Accept-Encoding', async () => {
		const res = await fetch(`${BASE_URL}/health`, {
			headers: { 'Accept-Encoding': 'gzip, deflate, br' },
		});
		expect(res.status).toBe(200);
		// The response should be valid regardless of compression
		const body = await res.json();
		expect(body).toHaveProperty('status', 'ok');
	});
});

describe('Isometric WASM asset integrity', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('serves isometric_game.js wasm-bindgen glue', async () => {
		const res = await fetch(
			`${BASE_URL}/isometric/assets/isometric_game.js`,
		);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toContain('javascript');
		const body = await res.text();
		// Must contain wasm-bindgen glue (initSync, worker_entry_point exports)
		expect(body).toContain('initSync');
	});

	it('isometric_game.js snippet imports resolve', async () => {
		const res = await fetch(
			`${BASE_URL}/isometric/assets/isometric_game.js`,
		);
		if (res.status !== 200) return;
		const body = await res.text();
		// Extract all relative snippet imports (e.g. ./snippets/bevy_tasker-.../inline0.js)
		const importPaths = [...body.matchAll(/from\s+['"](\.\/.+?)['"]/g)].map(
			(m) => m[1],
		);
		expect(importPaths.length).toBeGreaterThan(0);
		for (const relPath of importPaths) {
			const url = `${BASE_URL}/isometric/assets/${relPath}`;
			const snippet = await fetch(url);
			expect(
				snippet.status,
				`snippet ${relPath} should exist at ${url}`,
			).toBe(200);
		}
	});

	it('serves WASM binary (precompressed)', async () => {
		const res = await fetch(
			`${BASE_URL}/isometric/assets/isometric_game_bg.wasm`,
			{ headers: { 'Accept-Encoding': 'br, gzip' } },
		);
		// Server should serve the precompressed variant
		expect(res.status).toBe(200);
	});

	it('serves wasm-worker.js for pthread spawning', async () => {
		const res = await fetch(`${BASE_URL}/isometric/wasm-worker.js`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('worker_entry_point');
	});

	it('serves index.js entry point', async () => {
		const res = await fetch(`${BASE_URL}/isometric/assets/index.js`);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toContain('javascript');
	});

	it('game page loads and references all required assets', async () => {
		const res = await fetch(`${BASE_URL}/arcade/isometric/`);
		expect(res.status).toBe(200);
		const html = await res.text();

		// Page must reference the Vite entry point
		expect(html).toContain('/isometric/assets/index.js');

		// Entry point must exist and reference the wasm-bindgen glue
		const entryRes = await fetch(`${BASE_URL}/isometric/assets/index.js`);
		expect(entryRes.status).toBe(200);
		const entryJs = await entryRes.text();
		// Vite bundles the import of isometric_game.js — the output must
		// reference the wasm binary for WebAssembly.compileStreaming
		expect(entryJs).toContain('isometric_game');
	});

	it('full asset chain resolves (HTML → JS → WASM → snippets)', async () => {
		// 1. HTML page exists
		const page = await fetch(`${BASE_URL}/arcade/isometric/`);
		expect(page.status).toBe(200);

		// 2. wasm-bindgen glue JS exists
		const glue = await fetch(
			`${BASE_URL}/isometric/assets/isometric_game.js`,
		);
		expect(glue.status, 'isometric_game.js missing').toBe(200);
		const glueJs = await glue.text();

		// 3. WASM binary exists
		const wasm = await fetch(
			`${BASE_URL}/isometric/assets/isometric_game_bg.wasm`,
			{ headers: { 'Accept-Encoding': 'br, gzip' } },
		);
		expect(wasm.status, 'WASM binary missing').toBe(200);

		// 4. All snippet imports from the glue JS resolve
		const snippetImports = [
			...glueJs.matchAll(/from\s+['"](\.\/.+?)['"]/g),
		].map((m) => m[1]);
		for (const rel of snippetImports) {
			const url = `${BASE_URL}/isometric/assets/${rel}`;
			const s = await fetch(url);
			expect(s.status, `snippet 404: ${rel}`).toBe(200);
		}

		// 5. Worker script exists
		const worker = await fetch(`${BASE_URL}/isometric/wasm-worker.js`);
		expect(worker.status, 'wasm-worker.js missing').toBe(200);

		// 6. Safari shim exists
		const shim = await fetch(`${BASE_URL}/isometric/safari-shim.js`);
		expect(shim.status, 'safari-shim.js missing').toBe(200);
	});
});
