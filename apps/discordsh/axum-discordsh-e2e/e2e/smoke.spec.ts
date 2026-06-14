import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('axum-discordsh health endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /health returns 200 with JSON status', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toHaveProperty('status', 'ok');
		expect(body).toHaveProperty('health');
	});

	it('GET /healthz returns 200 with plain text', async () => {
		const res = await fetch(`${BASE_URL}/healthz`);
		expect(res.status).toBe(200);

		const text = await res.text();
		expect(text).toBe('ok');
	});

	it('GET /health responds within 500ms', async () => {
		const start = Date.now();
		const res = await fetch(`${BASE_URL}/health`);
		const elapsed = Date.now() - start;

		expect(res.status).toBe(200);
		expect(elapsed).toBeLessThan(500);
	});

	it('GET /nonexistent returns 404', async () => {
		const res = await fetch(`${BASE_URL}/nonexistent`);
		expect(res.status).toBe(404);
	});
});
