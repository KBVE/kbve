import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

const VALID_GUID = 'be92671d-af96-4a6b-bdf7-6a3b6270dae6';

describe('ROWS API — System', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /api/System/Status returns true', async () => {
		const res = await fetch(`${BASE_URL}/api/System/Status`, {
			headers: { 'X-Customer-GUID': VALID_GUID },
		});
		expect(res.status).toBe(200);
	});
});

describe('ROWS API — Auth guard', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('rejects requests without X-Customer-GUID', async () => {
		const res = await fetch(`${BASE_URL}/api/System/Status`);
		expect(res.status).toBe(401);
	});

	it('rejects empty GUID', async () => {
		const res = await fetch(`${BASE_URL}/api/System/Status`, {
			headers: {
				'X-Customer-GUID': '00000000-0000-0000-0000-000000000000',
			},
		});
		expect(res.status).toBe(401);
	});

	it('rejects invalid GUID format', async () => {
		const res = await fetch(`${BASE_URL}/api/System/Status`, {
			headers: { 'X-Customer-GUID': 'not-a-guid' },
		});
		expect(res.status).toBe(401);
	});
});

describe('ROWS API — Users (no DB)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('POST /api/Users/LoginAndCreateSession returns error without DB', async () => {
		const res = await fetch(`${BASE_URL}/api/Users/LoginAndCreateSession`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Customer-GUID': VALID_GUID,
			},
			body: JSON.stringify({
				email: 'test@example.com',
				password: 'testpass123',
			}),
		});
		// Without a DB, should return 500 or 503 — not 401 or panic
		expect(res.status).toBeGreaterThanOrEqual(400);
	});

	it('POST /api/Users/RegisterUser returns error without DB', async () => {
		const res = await fetch(`${BASE_URL}/api/Users/RegisterUser`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Customer-GUID': VALID_GUID,
			},
			body: JSON.stringify({
				email: 'newuser@example.com',
				password: 'password123',
				first_name: 'Test',
				last_name: 'User',
			}),
		});
		expect(res.status).toBeGreaterThanOrEqual(400);
	});
});

describe('ROWS API — CORS', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('OPTIONS returns CORS headers', async () => {
		const res = await fetch(`${BASE_URL}/health`, {
			method: 'OPTIONS',
			headers: {
				Origin: 'https://kbve.com',
				'Access-Control-Request-Method': 'GET',
			},
		});
		// Should not reject the preflight
		expect(res.status).toBeLessThan(400);
	});
});
