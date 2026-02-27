import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt, createBadSignatureJwt } from './helpers/jwt';

describe('JWT Authentication', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should reject requests without an Authorization header', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ command: 'get', secret_id: 'test' }),
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.msg).toContain('Missing authorization header');
	});

	it('should reject requests with a malformed Authorization header', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'NotBearer some-token',
			},
			body: JSON.stringify({ command: 'get', secret_id: 'test' }),
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.msg).toContain("not 'Bearer {token}'");
	});

	it('should reject a JWT signed with the wrong secret', async () => {
		const badToken = createBadSignatureJwt();
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${badToken}`,
			},
			body: JSON.stringify({ command: 'get', secret_id: 'test' }),
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.msg).toContain('Invalid JWT');
	});

	it('should reject an expired JWT', async () => {
		const expiredToken = createJwt({ expired: true });
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${expiredToken}`,
			},
			body: JSON.stringify({ command: 'get', secret_id: 'test' }),
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.msg).toContain('Invalid JWT');
	});

	it('should reject a completely garbage token string', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer not-a-real-jwt',
			},
			body: JSON.stringify({ command: 'get', secret_id: 'test' }),
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.msg).toContain('Invalid JWT');
	});

	it('should accept a valid JWT and pass through to the sub-function', async () => {
		const token = createJwt({ role: 'service_role' });
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
		// Main router accepted the JWT and forwarded to vault-reader.
		// Should NOT get 401 from the main router.
		expect(res.status).not.toBe(401);
	});
});
