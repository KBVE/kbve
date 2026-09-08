import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Root endpoint', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET / returns 200 with text', async () => {
		const res = await fetch(`${BASE_URL}/`);
		expect(res.status).toBe(200);

		const body = await res.text();
		expect(body).toContain('ChuckRPG');
	});

	it('GET /nonexistent returns 404', async () => {
		const res = await fetch(`${BASE_URL}/nonexistent-route-12345`);
		expect(res.status).toBe(404);
	});
});
