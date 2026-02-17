import { test, expect } from '@playwright/test';
import { signJwt } from './jwt';

test.describe('API: Authentication Required', () => {
	const protectedRoutes = [
		'/api/v1/status',
		'/api/v1/channels',
		'/api/v1/users',
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
