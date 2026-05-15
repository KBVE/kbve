import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('ROWS Health', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /health returns 200 with JSON', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty('status', 'healthy');
		expect(body).toHaveProperty('service', 'rows');
	});

	it('GET /health responds within 500ms', async () => {
		const start = performance.now();
		const res = await fetch(`${BASE_URL}/health`);
		const elapsed = performance.now() - start;
		expect(res.ok).toBe(true);
		expect(elapsed).toBeLessThan(500);
	});

	it('GET /ready returns readiness status', async () => {
		const res = await fetch(`${BASE_URL}/ready`);
		// May return 200 (all deps up) or 503 (DB missing in e2e) — both are valid responses
		expect([200, 503]).toContain(res.status);
		const body = await res.json();
		expect(body).toHaveProperty('status');
	});
});
