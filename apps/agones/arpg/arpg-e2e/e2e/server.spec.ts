import { test, expect } from '@playwright/test';
import { SERVER_HTTP, PROTOCOL_VERSION } from './env';
import { signJwt } from './jwt';
import { joinMatch } from './ws';

test.describe('arpg-server: HTTP', () => {
	test('GET /healthz returns ok', async ({ request }) => {
		const res = await request.get(`${SERVER_HTTP}/healthz`);
		expect(res.ok()).toBeTruthy();
		expect((await res.text()).trim()).toBe('ok');
	});

	test('GET /ws without upgrade returns 4xx', async ({ request }) => {
		const res = await request.get(`${SERVER_HTTP}/ws`);
		expect(res.status()).toBeGreaterThanOrEqual(400);
	});
});

test.describe('arpg-server: WebSocket join', () => {
	test('valid HS256 token + username is admitted (Welcome)', async () => {
		const jwt = await signJwt();
		const r = await joinMatch({ jwt, username: 'e2e_player' });
		expect(r.reject, r.reject?.reason).toBeUndefined();
		expect(r.welcome).toBeDefined();
		expect(r.welcome?.protocol).toBe(PROTOCOL_VERSION);
		expect(typeof r.welcome?.your_slot).toBe('number');
	});

	test('protocol mismatch is rejected', async () => {
		const jwt = await signJwt();
		const r = await joinMatch({ jwt, protocol: PROTOCOL_VERSION - 1 });
		expect(r.welcome).toBeUndefined();
		expect(r.reject?.reason ?? '').toMatch(/protocol mismatch/i);
	});

	test('invalid token is rejected', async () => {
		const r = await joinMatch({ jwt: 'not.a.jwt', username: 'e2e_player' });
		expect(r.welcome).toBeUndefined();
		expect(r.reject?.reason ?? '').toMatch(/auth rejected/i);
	});

	test('token without a kbve_username claim is rejected', async () => {
		const jwt = await signJwt({ kbve_username: '' });
		const r = await joinMatch({ jwt, username: '' });
		expect(r.welcome).toBeUndefined();
		expect(r.reject?.reason ?? '').toMatch(/auth rejected|username/i);
	});
});
