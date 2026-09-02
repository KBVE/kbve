import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt, type JwtRole } from './helpers/jwt';

describe('Role-Based Access Control on vault-reader', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	const makeVaultRequest = (role: JwtRole) => {
		const token = createJwt({ role });
		return fetch(`${BASE_URL}/vault-reader`, {
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
	};

	it('should allow service_role and forward to the function', async () => {
		const res = await makeVaultRequest('service_role');
		// Passes both the main router JWT gate and vault-reader role check.
		// RPC will fail (no Supabase), but we should NOT get 401 or 403.
		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(403);
	});

	it('should deny anon role with 403', async () => {
		const res = await makeVaultRequest('anon');
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toContain('Service role required');
	});

	it('should deny authenticated role with 403', async () => {
		const res = await makeVaultRequest('authenticated');
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toContain('Service role required');
	});
});
