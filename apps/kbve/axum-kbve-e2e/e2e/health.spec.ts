import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Health endpoint', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /health returns 200 with JSON', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toHaveProperty('status', 'ok');
		expect(body).toHaveProperty('version');
		expect(typeof body.version).toBe('string');
	});

	it('GET /health responds within 500ms', async () => {
		const start = Date.now();
		const res = await fetch(`${BASE_URL}/health`);
		const elapsed = Date.now() - start;

		expect(res.status).toBe(200);
		expect(elapsed).toBeLessThan(500);
	});

	it('GET /health.html returns 200 with HTML', async () => {
		const res = await fetch(`${BASE_URL}/health.html`);
		expect(res.status).toBe(200);

		const contentType = res.headers.get('content-type') ?? '';
		expect(contentType).toContain('text/html');

		const body = await res.text();
		expect(body).toContain('System Health');
		expect(body).toContain('Status');
	});
});
