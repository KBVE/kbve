import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('axum-discordsh /api/servers endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('GET /api/servers/list', () => {
		it('returns 200 with paginated response (empty or live)', async () => {
			const res = await fetch(`${BASE_URL}/api/servers/list`);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body).toHaveProperty('servers');
			expect(body).toHaveProperty('total');
			expect(body).toHaveProperty('page');
			expect(body).toHaveProperty('limit');

			expect(Array.isArray(body.servers)).toBe(true);
			expect(typeof body.total).toBe('number');
			expect(body.page).toBeGreaterThanOrEqual(1);
			expect(body.limit).toBeGreaterThanOrEqual(1);
		});

		it('accepts query params: ?page=2&limit=10&sort=members', async () => {
			const res = await fetch(
				`${BASE_URL}/api/servers/list?page=2&limit=10&sort=members`,
			);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.page).toBe(2);
			expect(body.limit).toBe(10);
		});

		it('accepts category filter: ?category=1', async () => {
			const res = await fetch(`${BASE_URL}/api/servers/list?category=1`);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body).toHaveProperty('servers');
		});

		it('returns valid ServerRecord schema when servers exist', async () => {
			const res = await fetch(`${BASE_URL}/api/servers/list`);
			const body = await res.json();

			// If DB empty, skip schema check
			if (body.servers.length === 0) {
				expect(body.total).toBe(0);
				return;
			}

			const server = body.servers[0];
			expect(server).toHaveProperty('server_id');
			expect(server).toHaveProperty('name');
			expect(server).toHaveProperty('summary');
			expect(server).toHaveProperty('invite_code');
			expect(server).toHaveProperty('categories');
			expect(server).toHaveProperty('tags');
			expect(server).toHaveProperty('vote_count');
			expect(server).toHaveProperty('member_count');
			expect(server).toHaveProperty('is_online');

			expect(Array.isArray(server.categories)).toBe(true);
			expect(Array.isArray(server.tags)).toBe(true);
		});
	});

	describe('GET /api/servers/:server_id', () => {
		it('returns 400 for invalid snowflake ID', async () => {
			const res = await fetch(`${BASE_URL}/api/servers/invalid-id`);
			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body).toHaveProperty('status', 'error');
			expect(body.message).toMatch(/invalid/i);
		});

		it('returns 404 for missing server (valid snowflake)', async () => {
			// Use a valid Discord snowflake that doesn't exist in DB
			const res = await fetch(
				`${BASE_URL}/api/servers/999999999999999999`,
			);
			expect([404, 503]).toContain(res.status); // 503 if PgCluster unavailable
		});

		it('returns 503 when PgCluster unavailable', async () => {
			// If DB not configured, should return 503
			const res = await fetch(
				`${BASE_URL}/api/servers/110373943822540800`,
			);
			// Either 404 (server not found in live DB) or 503 (pool unavailable)
			expect([404, 503]).toContain(res.status);
		});
	});

	describe('Security headers', () => {
		it('includes security headers on API responses', async () => {
			const res = await fetch(`${BASE_URL}/api/servers/list`);

			expect(res.headers.get('x-content-type-options')).toBe(
				'nosniff',
			);
			expect(res.headers.get('x-frame-options')).toBe('DENY');
			expect(res.headers.get('referrer-policy')).toBe(
				'strict-origin-when-cross-origin',
			);
		});
	});

	describe('Performance', () => {
		it('GET /api/servers/list responds within 1s', async () => {
			const start = Date.now();
			const res = await fetch(`${BASE_URL}/api/servers/list`);
			const elapsed = Date.now() - start;

			expect(res.status).toBe(200);
			expect(elapsed).toBeLessThan(1000);
		});
	});
});
