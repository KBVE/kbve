import { describe, it, expect } from 'vitest';
import { url } from './helpers/base';

describe('health', () => {
	it('answers 200 with the plain-text probe body', async () => {
		const res = await fetch(url('/health'));
		expect(res.status).toBe(200);
		expect((await res.text()).trim()).toBe('OK');
	});
});

describe('security headers', () => {
	it('sets the hardening headers and refuses caching', async () => {
		const res = await fetch(url('/health'));
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(res.headers.get('referrer-policy')).toBe(
			'strict-origin-when-cross-origin',
		);
		expect(res.headers.get('cache-control')).toBe('no-store');
	});
});

describe('mail routes', () => {
	const routes = [
		'/mail/me',
		'/mail/inbox',
		'/mail/threads',
		'/mail/threads/0f0b2d1e-3b5f-4b39-9c9d-2b8c8a6f1d2e',
		'/mail/messages/0f0b2d1e-3b5f-4b39-9c9d-2b8c8a6f1d2e',
	];

	it.each(routes)(
		'%s is mounted and rejects an anonymous read',
		async (path) => {
			const res = await fetch(url(path));
			expect(res.status).toBe(401);
		},
	);

	it('rejects a send without a bearer', async () => {
		const res = await fetch(url('/mail/send'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				to: 'nobody@example.com',
				subject: 'x',
				body: 'x',
			}),
		});
		expect(res.status).toBe(401);
	});
});

describe('stalwart hook', () => {
	it('refuses calls while STALWART_HOOK_SECRET is unset', async () => {
		const res = await fetch(url('/hooks/stalwart'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ context: { stage: 'connect' } }),
		});
		expect(res.status).toBe(503);
	});
});

describe('cors', () => {
	it('reflects an allowlisted origin', async () => {
		const res = await fetch(url('/health'), {
			headers: { origin: 'https://herbmail.com' },
		});
		expect(res.headers.get('access-control-allow-origin')).toBe(
			'https://herbmail.com',
		);
	});

	it('withholds the header from an origin outside the allowlist', async () => {
		const res = await fetch(url('/health'), {
			headers: { origin: 'https://evil.example.com' },
		});
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
	});
});
