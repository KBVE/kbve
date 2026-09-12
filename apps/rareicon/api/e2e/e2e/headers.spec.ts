import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('HTTP headers and middleware', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /health includes JSON content type and security headers', async () => {
		const res = await fetch(`${BASE_URL}/health`);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/json');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(res.headers.get('referrer-policy')).toBe(
			'strict-origin-when-cross-origin',
		);
	});

	it('GET / receives HTML cache headers from the static fallback pipeline', async () => {
		const res = await fetch(`${BASE_URL}/`);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		expect(res.headers.get('cache-control')).toContain('max-age=86400');
	});

	it('CORS preflight allows browser clients to call public endpoints', async () => {
		const res = await fetch(`${BASE_URL}/health`, {
			method: 'OPTIONS',
			headers: {
				origin: 'https://rareicon.com',
				'access-control-request-method': 'GET',
			},
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
		expect(res.headers.get('access-control-allow-methods')).toMatch(
			/\*|GET/,
		);
	});
});
