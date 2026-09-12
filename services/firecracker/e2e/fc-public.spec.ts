import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

const DEPLOY_BASE = {
	rootfs: 'alpine-python',
	entrypoint: '/usr/bin/python3',
	http_port: 8080,
};

describe('Persistent endpoints — /fc/* + /fc/public/*', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('rejects deploy with reserved name "public"', async () => {
		const res = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...DEPLOY_BASE, name: 'public' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('reserved');
	});

	it('rejects CORS wildcard with credentials', async () => {
		const res = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...DEPLOY_BASE,
				name: 'fc-test-wildcard-creds',
				http_config: {
					cors_allow_origins: ['*'],
					cors_allow_credentials: true,
				},
			}),
		});
		expect(res.status).toBe(400);
	});

	it('rejects reserved inject header name', async () => {
		const res = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...DEPLOY_BASE,
				name: 'fc-test-reserved-header',
				http_config: {
					inject_request_headers: { Authorization: 'Bearer x' },
				},
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('reserved');
	});

	it('rejects CORS origin without scheme', async () => {
		const res = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...DEPLOY_BASE,
				name: 'fc-test-bad-origin',
				http_config: { cors_allow_origins: ['kbve.com'] },
			}),
		});
		expect(res.status).toBe(400);
	});

	it('rejects rate_limit.requests_per_sec over cap', async () => {
		const res = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...DEPLOY_BASE,
				name: 'fc-test-rate-cap',
				http_config: { rate_limit: { requests_per_sec: 1_000_000 } },
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('requests_per_sec');
	});

	it('rejects idle_ttl_secs over 30 days', async () => {
		const res = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...DEPLOY_BASE,
				name: 'fc-test-ttl-cap',
				idle_ttl_secs: 365 * 24 * 60 * 60,
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('idle_ttl_secs');
	});

	it('rejects inject header value with CR/LF (response-splitting guard)', async () => {
		const res = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...DEPLOY_BASE,
				name: 'fc-test-crlf',
				http_config: {
					inject_request_headers: {
						'X-Evil': 'a\r\nSet-Cookie: pwned=1',
					},
				},
			}),
		});
		expect(res.status).toBe(400);
	});

	it('/public-proxy/{name} returns 503 when persistent endpoints disabled', async () => {
		const res = await fetch(`${BASE_URL}/public-proxy/anything-here`);
		expect(res.status).toBe(503);
	});
});
