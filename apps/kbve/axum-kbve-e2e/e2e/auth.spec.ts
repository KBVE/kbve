import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

describe('Auth-protected endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('GET /api/v1/profile/me', () => {
		it('rejects requests without Authorization header', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/profile/me`);
			expect(res.status).toBe(401);
		});

		it('rejects requests with malformed Authorization header', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/profile/me`, {
				headers: { Authorization: 'not-a-bearer-token' },
			});
			expect(res.status).toBe(401);
		});

		it('rejects requests with garbage token', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/profile/me`, {
				headers: { Authorization: 'Bearer garbage.token.here' },
			});
			// Without Supabase connection, expect 401 or 503
			expect([401, 503]).toContain(res.status);
		});
	});

	describe('POST /api/v1/profile/username', () => {
		it('rejects requests without Authorization header', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/profile/username`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: 'testuser' }),
			});
			expect(res.status).toBe(401);
		});

		it('rejects requests with valid JWT format but no Supabase backend', async () => {
			const token = createJwt({
				role: 'authenticated',
				extraClaims: { sub: '00000000-0000-0000-0000-000000000000' },
			});
			const res = await fetch(`${BASE_URL}/api/v1/profile/username`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ username: 'testuser' }),
			});
			// Without Supabase, expect 401 or 503
			expect([401, 503]).toContain(res.status);
		});
	});
});
