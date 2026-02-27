import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

const FAKE_USER_ID = '00000000-1111-2222-3333-444444444444';

describe('User Vault — Auth & Routing', () => {
	let serviceToken: string;
	let authToken: string;
	let anonToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
		authToken = createJwt({
			role: 'authenticated',
			extraClaims: { sub: FAKE_USER_ID },
		});
		anonToken = createJwt({ role: 'anon' });
	});

	const serviceHeaders = () => ({
		'Content-Type': 'application/json',
		Authorization: `Bearer ${serviceToken}`,
	});

	const authHeaders = () => ({
		'Content-Type': 'application/json',
		Authorization: `Bearer ${authToken}`,
	});

	// -- CORS --

	it('should return 200 for OPTIONS preflight without JWT', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'OPTIONS',
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});

	// -- Method --

	it('should return 405 for GET requests', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${serviceToken}` },
		});
		expect(res.status).toBe(405);
		const body = await res.json();
		expect(body.error).toContain('Only POST method is allowed');
	});

	// -- Auth --

	it('should return 401 when no auth header is provided', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ command: 'tokens.list_tokens' }),
		});
		expect(res.status).toBe(401);
	});

	it('should return 403 for anon role', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${anonToken}`,
			},
			body: JSON.stringify({
				command: 'tokens.list_tokens',
				user_id: FAKE_USER_ID,
			}),
		});
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toContain('authenticated or service_role required');
	});

	// -- Service-role user_id resolution --

	it('should return 400 when service_role call is missing user_id', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: serviceHeaders(),
			body: JSON.stringify({ command: 'tokens.list_tokens' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('user_id is required');
	});

	it('should return 400 when service_role provides invalid UUID', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: serviceHeaders(),
			body: JSON.stringify({
				command: 'tokens.list_tokens',
				user_id: 'not-a-uuid',
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('valid UUID');
	});

	// -- Authenticated user sub claim --

	it('should pass auth for authenticated JWT with sub claim', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({ command: 'tokens.list_tokens' }),
		});
		// Should NOT be 401 or 403 — auth passed, it will fail at RPC
		// (no real Supabase backend) but the auth layer is fine
		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(403);
	});

	// -- Command routing --

	it('should return 400 when command is missing', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: serviceHeaders(),
			body: JSON.stringify({ user_id: FAKE_USER_ID }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('command is required');
	});

	it('should return 400 for bad command format (no dot)', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: serviceHeaders(),
			body: JSON.stringify({
				command: 'list_tokens',
				user_id: FAKE_USER_ID,
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('module.action');
	});

	it('should return 400 for unknown module', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: serviceHeaders(),
			body: JSON.stringify({
				command: 'unknown.action',
				user_id: FAKE_USER_ID,
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('Unknown module');
	});

	it('should return 400 for unknown action within tokens module', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: serviceHeaders(),
			body: JSON.stringify({
				command: 'tokens.nonexistent',
				user_id: FAKE_USER_ID,
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('Unknown token action');
	});

	// -- Malformed body --

	it('should return 500 for malformed JSON body', async () => {
		const res = await fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: '{not valid json',
		});
		expect(res.status).toBe(500);
	});
});

describe('User Vault — Token Handler Validation', () => {
	let serviceToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
	});

	const post = (body: Record<string, unknown>) =>
		fetch(`${BASE_URL}/user-vault`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({ user_id: FAKE_USER_ID, ...body }),
		});

	it('set_token: should return 400 when token_name is missing', async () => {
		const res = await post({
			command: 'tokens.set_token',
			service: 'github',
			token_value: 'ghp_test123456789',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_name');
	});

	it('set_token: should return 400 when service is missing', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'my_pat',
			token_value: 'ghp_test123456789',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('service');
	});

	it('set_token: should return 400 when token_value is missing', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'my_pat',
			service: 'github',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_value');
	});

	it('get_token: should return 400 when token_id is missing', async () => {
		const res = await post({ command: 'tokens.get_token' });
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_id');
	});

	it('delete_token: should return 400 when token_id is missing', async () => {
		const res = await post({ command: 'tokens.delete_token' });
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_id');
	});

	it('toggle_token: should return 400 when token_id is missing', async () => {
		const res = await post({
			command: 'tokens.toggle_token',
			is_active: false,
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_id');
	});

	it('toggle_token: should return 400 when is_active is missing', async () => {
		const res = await post({
			command: 'tokens.toggle_token',
			token_id: '00000000-0000-0000-0000-000000000001',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('is_active');
	});
});
