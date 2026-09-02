import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

describe('Function Routing', () => {
	let token: string;

	beforeAll(async () => {
		await waitForReady();
		token = createJwt();
	});

	it('should return 400 when no function name is provided', async () => {
		const res = await fetch(BASE_URL, {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.msg).toContain('missing function name in request');
	});

	it('should return 500 for a non-existent function', async () => {
		const res = await fetch(`${BASE_URL}/nonexistent-function`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.msg).toBeDefined();
	});

	it('should route to vault-reader when path is /vault-reader', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				command: 'get',
				secret_id: '00000000-0000-0000-0000-000000000000',
			}),
		});
		// Reaches vault-reader (not a routing-level error).
		// Main router errors use 'msg', vault-reader uses 'error'.
		expect(res.status).not.toBe(400);
		const body = await res.json();
		expect(body.msg).toBeUndefined();
	});
});
