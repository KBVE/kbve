import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('404 handling', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('a random unknown path returns 404', async () => {
		const res = await fetch(
			`${BASE_URL}/this-route-definitely-does-not-exist-${Date.now()}/`,
		);
		expect(res.status).toBe(404);
	});

	it('unknown JSON endpoint returns 404', async () => {
		const res = await fetch(
			`${BASE_URL}/api/this-endpoint-does-not-exist-${Date.now()}.json`,
		);
		expect(res.status).toBe(404);
	});

	it('404 response is HTML (custom page, not a bare error)', async () => {
		const res = await fetch(`${BASE_URL}/nope-${Date.now()}/`);
		expect(res.status).toBe(404);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toContain('text/html');
		const body = await res.text();
		expect(body.length).toBeGreaterThan(200);
	});
});
