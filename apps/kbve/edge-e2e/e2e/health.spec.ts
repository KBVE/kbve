import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

describe('Edge Runtime Health', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should be reachable and respond to HTTP requests', async () => {
		const res = await fetch(BASE_URL);
		expect([400, 401]).toContain(res.status);
	});

	it('should return 400 with valid JWT but no function name', async () => {
		const token = createJwt();
		const res = await fetch(BASE_URL, {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.msg).toContain('missing function name in request');
	});

	it('should return health and version JSON without auth', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('ok');
		expect(body.version).toBeDefined();
		expect(body.timestamp).toBeDefined();
	});

	it('should return a valid ISO timestamp in health response', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		const body = await res.json();
		const parsed = new Date(body.timestamp);
		expect(parsed.getTime()).not.toBeNaN();
	});
});
