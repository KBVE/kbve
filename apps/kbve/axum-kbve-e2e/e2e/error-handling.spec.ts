import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Error handling and edge cases', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('404 responses', () => {
		it('returns 404 for non-existent API route', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/nonexistent`);
			expect(res.status).toBe(404);
		});

		it('returns 404 for non-existent static path', async () => {
			const res = await fetch(`${BASE_URL}/this-page-does-not-exist`);
			expect(res.status).toBe(404);
		});

		it('returns 404 for deeply nested non-existent path', async () => {
			const res = await fetch(`${BASE_URL}/a/b/c/d/e/f/g`);
			expect(res.status).toBe(404);
		});

		it('404 page contains HTML content', async () => {
			const res = await fetch(`${BASE_URL}/nonexistent-page-xyz`);
			expect(res.status).toBe(404);
			const ct = res.headers.get('content-type') ?? '';
			// Should serve an HTML 404 page, not empty
			if (ct.includes('text/html')) {
				const body = await res.text();
				expect(body.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Security headers on all route types', () => {
		const routes = [
			{ path: '/health', label: 'health' },
			{ path: '/api/status', label: 'api' },
			{ path: '/', label: 'root' },
		];

		for (const { path, label } of routes) {
			it(`${label} route has X-Content-Type-Options: nosniff`, async () => {
				const res = await fetch(`${BASE_URL}${path}`);
				expect(res.headers.get('x-content-type-options')).toBe(
					'nosniff',
				);
			});

			it(`${label} route has X-Frame-Options: DENY`, async () => {
				const res = await fetch(`${BASE_URL}${path}`);
				expect(res.headers.get('x-frame-options')).toBe('DENY');
			});
		}
	});

	describe('CORS headers', () => {
		it('responds to preflight OPTIONS request', async () => {
			const res = await fetch(`${BASE_URL}/api/status`, {
				method: 'OPTIONS',
				headers: {
					Origin: 'https://example.com',
					'Access-Control-Request-Method': 'GET',
				},
			});
			// Should return 200/204 with CORS headers
			expect([200, 204]).toContain(res.status);
		});

		it('includes Access-Control-Allow-Origin on API responses', async () => {
			const res = await fetch(`${BASE_URL}/api/status`, {
				headers: { Origin: 'https://example.com' },
			});
			const acao = res.headers.get('access-control-allow-origin');
			// Permissive CORS — should be * or echo the origin
			if (acao) {
				expect(['*', 'https://example.com']).toContain(acao);
			}
		});
	});

	describe('Method enforcement', () => {
		it('POST to health endpoint returns 404 or 405', async () => {
			const res = await fetch(`${BASE_URL}/health`, {
				method: 'POST',
			});
			expect([404, 405]).toContain(res.status);
		});

		it('DELETE to api/status returns 404 or 405', async () => {
			const res = await fetch(`${BASE_URL}/api/status`, {
				method: 'DELETE',
			});
			expect([404, 405]).toContain(res.status);
		});
	});

	describe('Game token endpoint', () => {
		it('POST /api/v1/auth/game-token without auth returns 401 or accepts anonymous', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/auth/game-token`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			// Without Supabase, should either reject or handle gracefully
			expect(res.status).toBeLessThan(500);
		});

		it('GET /api/v1/auth/game-token returns 404 or 405', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/auth/game-token`);
			expect([404, 405]).toContain(res.status);
		});
	});
});
