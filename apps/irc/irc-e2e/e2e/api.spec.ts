import { test, expect } from '@playwright/test';
import { signJwt } from './jwt';

test.describe('API: Authentication Required', () => {
	const protectedRoutes = [
		'/api/v1/status',
		'/api/v1/channels',
		'/api/v1/users',
		'/api/v1/me',
	];

	for (const route of protectedRoutes) {
		test(`${route} without token returns 401`, async ({ request }) => {
			const response = await request.get(route);
			expect(response.status()).toBe(401);
		});
	}
});

test.describe('API: Authenticated Requests', () => {
	test('GET /api/v1/status with valid JWT returns 200', async ({
		request,
	}) => {
		const token = await signJwt();
		const response = await request.get('/api/v1/status', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty('status');
	});

	test('GET /api/v1/channels with valid JWT returns 200', async ({
		request,
	}) => {
		const token = await signJwt();
		const response = await request.get('/api/v1/channels', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
	});

	test('GET /api/v1/users with valid JWT returns 200', async ({
		request,
	}) => {
		const token = await signJwt();
		const response = await request.get('/api/v1/users', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
	});
});

test.describe('API: /me identity probe', () => {
	test('returns has_username=false when no provider username', async ({
		request,
	}) => {
		const token = await signJwt();
		const response = await request.get('/api/v1/me', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.has_username).toBe(false);
		expect(body.username).toBeNull();
		expect(typeof body.setup_url).toBe('string');
		expect(body.setup_url.length).toBeGreaterThan(0);
		expect(body.sub).toBe('e2e-test-user');
	});

	test('returns username from kbve_username claim', async ({ request }) => {
		const token = await signJwt({ kbve_username: 'h0lybyte' });
		const response = await request.get('/api/v1/me', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.has_username).toBe(true);
		expect(body.username).toBe('h0lybyte');
	});

	test('falls back to user_metadata.preferred_username', async ({
		request,
	}) => {
		const token = await signJwt({
			user_metadata: { preferred_username: 'h0lybyte' },
		});
		const response = await request.get('/api/v1/me', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.has_username).toBe(true);
		expect(body.username).toBe('h0lybyte');
	});

	test('kbve_username wins over user_metadata when both present', async ({
		request,
	}) => {
		const token = await signJwt({
			kbve_username: 'kbve_h0ly',
			user_metadata: { preferred_username: 'oauth_alt' },
		});
		const response = await request.get('/api/v1/me', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.username).toBe('kbve_h0ly');
	});

	test('strips disallowed characters and truncates', async ({ request }) => {
		const token = await signJwt({
			kbve_username: 'h0ly!byte@123-extra-long-name',
		});
		const response = await request.get('/api/v1/me', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.has_username).toBe(true);
		expect(body.username).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(body.username.length).toBeLessThanOrEqual(16);
	});
});

test.describe('API: Invalid Token', () => {
	test('expired token returns 401', async ({ request }) => {
		const token = await signJwt({
			iat: Math.floor(Date.now() / 1000) - 7200,
			exp: Math.floor(Date.now() / 1000) - 3600,
		});
		const response = await request.get('/api/v1/status', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status()).toBe(401);
	});

	test('malformed token returns 401', async ({ request }) => {
		const response = await request.get('/api/v1/status', {
			headers: { Authorization: 'Bearer not.a.valid.jwt' },
		});
		expect(response.status()).toBe(401);
	});
});
