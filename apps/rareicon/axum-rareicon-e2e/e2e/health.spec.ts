import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Health endpoint', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /health returns 200 with JSON', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/json');

		const body = await res.json();
		expect(body).toHaveProperty('status', 'ok');
		expect(body).toHaveProperty('service', 'axum-rareicon');
		expect(body).toHaveProperty('version');
		expect(typeof body.version).toBe('string');
		expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
	});

	it('GET /api/health mirrors /health', async () => {
		const [health, apiHealth] = await Promise.all([
			fetch(`${BASE_URL}/health`).then((res) => res.json()),
			fetch(`${BASE_URL}/api/health`).then((res) => res.json()),
		]);

		expect(apiHealth).toEqual(health);
	});

	it('GET /health responds within 500ms', async () => {
		const start = Date.now();
		const res = await fetch(`${BASE_URL}/health`);
		const elapsed = Date.now() - start;

		expect(res.status).toBe(200);
		expect(elapsed).toBeLessThan(500);
	});
});
