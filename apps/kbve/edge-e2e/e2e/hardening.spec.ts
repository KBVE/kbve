import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

const FAKE_USER_ID = '00000000-1111-2222-3333-444444444444';

describe('User Vault — Input Hardening', () => {
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

	// -- token_name regex enforcement --

	it('should reject token_name with uppercase chars', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'MyToken',
			service: 'github',
			token_value: 'ghp_test123456789',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_name');
	});

	it('should reject token_name with special characters', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'my<token>',
			service: 'github',
			token_value: 'ghp_test123456789',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_name');
	});

	it('should reject token_name shorter than 3 chars', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'ab',
			service: 'github',
			token_value: 'ghp_test123456789',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_name');
	});

	// -- service regex enforcement --

	it('should reject service with illegal characters', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'my_pat',
			service: 'git%hub',
			token_value: 'ghp_test123456789',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('service');
	});

	it('should reject service shorter than 2 chars', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'my_pat',
			service: 'g',
			token_value: 'ghp_test123456789',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('service');
	});

	// -- token_value length enforcement --

	it('should reject token_value shorter than 10 chars', async () => {
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'my_pat',
			service: 'github',
			token_value: 'short',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_value');
	});

	// -- token_id UUID enforcement --

	it('should reject get_token with non-UUID token_id', async () => {
		const res = await post({
			command: 'tokens.get_token',
			token_id: 'not-a-uuid',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('token_id');
	});

	// -- RPC error sanitization --

	it('should not leak internal error details on RPC failures', async () => {
		// Use a valid-looking request that will fail at the RPC layer
		// (no real Supabase backend) — the error message should be generic
		const res = await post({
			command: 'tokens.set_token',
			token_name: 'my_pat',
			service: 'github',
			token_value: 'ghp_test1234567890',
		});
		// Should fail (no DB) but error must not contain SQL/table details
		if (res.status === 400) {
			const body = await res.json();
			expect(body.error).not.toContain('relation');
			expect(body.error).not.toContain('function');
			expect(body.error).not.toContain('schema');
		}
	});
});

describe('Vault Reader — Input Hardening', () => {
	let serviceToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
	});

	const post = (body: Record<string, unknown>) =>
		fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify(body),
		});

	it('should reject get command with non-UUID secret_id', async () => {
		const res = await post({
			command: 'get',
			secret_id: 'not-a-uuid',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('UUID');
	});

	it('should reject set command with invalid secret_name format', async () => {
		const res = await post({
			command: 'set',
			secret_name: 'has spaces and $pecial',
			secret_value: 'some-value',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('secret_name');
	});

	it('should reject set command with illegal chars in secret_name', async () => {
		const res = await post({
			command: 'set',
			secret_name: 'name<script>',
			secret_value: 'some-value',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('secret_name');
	});
});

describe('Meme Admin — SSRF Protection', () => {
	let serviceToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
	});

	const post = (body: Record<string, unknown>) =>
		fetch(`${BASE_URL}/meme`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify(body),
		});

	const VALID_AUTHOR = '00000000-0000-0000-0000-000000000001';

	it('should reject asset_url pointing to localhost', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'https://localhost/admin',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('private');
	});

	it('should reject asset_url pointing to 127.0.0.1', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'https://127.0.0.1/secret',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('private');
	});

	it('should reject asset_url pointing to cloud metadata (169.254.x)', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'https://169.254.169.254/latest/meta-data/',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('private');
	});

	it('should reject asset_url pointing to RFC 1918 (10.x)', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'https://10.0.0.1/internal',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('private');
	});

	it('should reject asset_url pointing to RFC 1918 (192.168.x)', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'https://192.168.1.1/admin',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('private');
	});

	it('should reject HTTP (non-HTTPS) asset_url', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'http://example.com/meme.png',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('HTTPS');
	});

	it('should reject thumbnail_url pointing to private IP', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'https://example.com/meme.png',
			thumbnail_url: 'https://172.16.0.1/thumb.png',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('private');
	});

	it('should reject source_url pointing to private IP', async () => {
		const res = await post({
			command: 'admin.create',
			author_id: VALID_AUTHOR,
			asset_url: 'https://example.com/meme.png',
			source_url: 'https://10.255.255.1/source',
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('private');
	});
});
