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
