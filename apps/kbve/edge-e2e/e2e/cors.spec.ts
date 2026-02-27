import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('CORS Preflight Handling', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should respond to OPTIONS on vault-reader without requiring JWT', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'OPTIONS',
			headers: {
				Origin: 'https://example.com',
				'Access-Control-Request-Method': 'POST',
				'Access-Control-Request-Headers': 'authorization, content-type',
			},
		});
		expect(res.ok).toBe(true);
	});

	it('should include CORS headers in the OPTIONS response', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'OPTIONS',
			headers: {
				Origin: 'https://example.com',
				'Access-Control-Request-Method': 'POST',
			},
		});
		const allowOrigin = res.headers.get('access-control-allow-origin');
		const allowHeaders = res.headers.get('access-control-allow-headers');
		expect(allowOrigin).toBe('*');
		expect(allowHeaders).toContain('authorization');
		expect(allowHeaders).toContain('content-type');
	});
});
