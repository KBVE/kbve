import { test, expect } from '@playwright/test';
import { API_ROUTES } from './helpers/routes';

test.describe('JSON API endpoints', () => {
	for (const route of API_ROUTES) {
		test(`${route.label} (${route.path}) returns valid JSON`, async ({
			request,
		}) => {
			const response = await request.get(route.path);
			expect(response.status()).toBe(200);

			const contentType = response.headers()['content-type'];
			expect(contentType).toContain('application/json');

			const body = await response.json();
			expect(body).toBeTruthy();
			expect(typeof body).toBe('object');

			// Each endpoint wraps its data in an object with a primary key
			// containing an array (e.g. { applications: [...], key: ... })
			const values = Object.values(body);
			const hasArray = values.some((v) => Array.isArray(v));
			expect(hasArray).toBe(true);
		});
	}
});
