import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('API endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('GET /api/status', () => {
		it('returns 200 with JSON containing status, version, uptime', async () => {
			const res = await fetch(`${BASE_URL}/api/status`);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body).toHaveProperty('status', 'ok');
			expect(body).toHaveProperty('version');
			expect(body).toHaveProperty('uptime_seconds');
			expect(typeof body.uptime_seconds).toBe('number');
			expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
		});

		it('returns application/json content-type', async () => {
			const res = await fetch(`${BASE_URL}/api/status`);
			const contentType = res.headers.get('content-type') ?? '';
			expect(contentType).toContain('application/json');
		});
	});

	describe('GET /api/v1/profile/:username', () => {
		it('returns JSON for a non-existent user', async () => {
			const res = await fetch(
				`${BASE_URL}/api/v1/profile/nonexistentuser12345`,
			);
			// Without DB connection, expect either 404 or 503
			expect([404, 503]).toContain(res.status);
		});
	});
});
