import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Smoke tests', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET / returns 200 with HTML', async () => {
		const res = await fetch(`${BASE_URL}/`);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toContain('text/html');
	});

	it('homepage contains KBVE', async () => {
		const res = await fetch(`${BASE_URL}/`);
		const body = await res.text();
		expect(body).toContain('KBVE');
	});

	it('GET /health returns 200 with JSON', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty('status', 'ok');
	});

	it('GET /nonexistent returns 404', async () => {
		const res = await fetch(`${BASE_URL}/nonexistent-route-xyz/`);
		expect(res.status).toBe(404);
	});
});
