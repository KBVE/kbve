import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Static fallback (astro dist served by axum)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET / returns 200 with HTML containing RareIcon', async () => {
		const res = await fetch(`${BASE_URL}/`);
		expect(res.status).toBe(200);

		const body = await res.text();
		expect(body).toContain('RareIcon');
	});

	it('GET /steam/ returns 200', async () => {
		const res = await fetch(`${BASE_URL}/steam/`);
		expect(res.status).toBe(200);
	});

	it('GET /icons/ returns 200 with library content', async () => {
		const res = await fetch(`${BASE_URL}/icons/`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('Icon');
	});

	it('GET /nonexistent returns 404', async () => {
		const res = await fetch(`${BASE_URL}/nonexistent-route-12345`);
		expect(res.status).toBe(404);
	});
});
