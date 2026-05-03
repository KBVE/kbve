import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

// Forum edge function — public-read smoke tests. Anon JWTs are
// permitted on every action; service_role is what's used internally
// to call the locked service_* RPCs.
describe('Forum — Smoke Tests', () => {
	let anonToken: string;
	let serviceToken: string;

	beforeAll(async () => {
		await waitForReady();
		anonToken = createJwt({ role: 'anon' });
		serviceToken = createJwt({ role: 'service_role' });
	});

	const post = (body: unknown, token = anonToken) =>
		fetch(`${BASE_URL}/forum`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		});

	// -- CORS / method --

	it('returns 200 for OPTIONS preflight without JWT', async () => {
		const res = await fetch(`${BASE_URL}/forum`, { method: 'OPTIONS' });
		expect(res.status).toBe(200);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});

	it('returns 405 for GET', async () => {
		const res = await fetch(`${BASE_URL}/forum`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${anonToken}` },
		});
		expect(res.status).toBe(405);
	});

	// -- Auth --

	it('returns 401 when no auth header is provided', async () => {
		const res = await fetch(`${BASE_URL}/forum`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ command: 'space.list' }),
		});
		expect(res.status).toBe(401);
	});

	it('accepts anon role (no role gate)', async () => {
		const res = await post({ command: 'space.list' });
		// Either 200 (DB reachable) or 502 (DB unreachable in CI sandbox)
		// — the important thing is we did NOT 403 on anon.
		expect([200, 502]).toContain(res.status);
	});

	// -- Command parsing --

	it('rejects missing command with 400', async () => {
		const res = await post({});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('command is required');
	});

	it('rejects unknown module with 400', async () => {
		const res = await post({ command: 'nope.list' });
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('Unknown module');
	});

	it('rejects unknown action with 400', async () => {
		const res = await post({ command: 'space.nope' });
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('unknown action');
	});

	// -- Slug validation --

	it('rejects bad slug on space.get with 400', async () => {
		const res = await post({ command: 'space.get', slug: 'BAD slug!' });
		expect(res.status).toBe(400);
	});

	it('rejects bad slug on tag.get with 400', async () => {
		const res = await post({ command: 'tag.get', slug: '#nope' });
		expect(res.status).toBe(400);
	});

	// -- Happy paths (smoke only — DB content not asserted) --

	it('space.list returns { spaces: [] } shape', async () => {
		const res = await post({ command: 'space.list' });
		if (res.status === 200) {
			const body = await res.json();
			expect(Array.isArray(body.spaces)).toBe(true);
		}
	});

	it('tag.list returns { tags: [] } shape', async () => {
		const res = await post({ command: 'tag.list', limit: 25 });
		if (res.status === 200) {
			const body = await res.json();
			expect(Array.isArray(body.tags)).toBe(true);
		}
	});

	it('thread.list returns { threads: [] } shape on default sort', async () => {
		const res = await post({ command: 'thread.list', limit: 5 });
		if (res.status === 200) {
			const body = await res.json();
			expect(Array.isArray(body.threads)).toBe(true);
			expect(body.sort).toBe('hot');
		}
	});

	it('thread.list rejects bad space_slug with 400', async () => {
		const res = await post({
			command: 'thread.list',
			space_slug: 'NOPE!',
		});
		expect([400, 404]).toContain(res.status);
	});

	// -- service_role still works (no role gate means it should succeed
	// the same way anon does) --
	it('accepts service_role on space.list', async () => {
		const res = await post({ command: 'space.list' }, serviceToken);
		expect([200, 502]).toContain(res.status);
	});
});
