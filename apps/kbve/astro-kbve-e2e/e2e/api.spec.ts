import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { API_ROUTES } from './helpers/routes';

describe('API JSON endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const route of API_ROUTES) {
		it(`${route.label} (${route.path}) returns valid JSON`, async () => {
			const res = await fetch(`${BASE_URL}${route.path}`);
			expect(res.status).toBe(200);
			const ct = res.headers.get('content-type') ?? '';
			expect(ct).toContain('json');
			const body = await res.json();
			expect(body).toBeDefined();
		});
	}
});
