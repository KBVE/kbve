import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { CONTENT_ROUTES, AUTH_ROUTES, DATA_ROUTES } from './helpers/routes';

describe('Content routes', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const route of CONTENT_ROUTES) {
		it(`${route.label} (${route.path}) returns 200`, async () => {
			const res = await fetch(`${BASE_URL}${route.path}`);
			expect(res.status).toBe(200);
		});
	}
});

describe('Auth routes', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const route of AUTH_ROUTES) {
		it(`${route.label} (${route.path}) returns 200`, async () => {
			const res = await fetch(`${BASE_URL}${route.path}`);
			expect(res.status).toBe(200);
		});
	}
});

describe('Data collection routes', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const route of DATA_ROUTES) {
		it(`${route.label} (${route.path}) returns 200`, async () => {
			const res = await fetch(`${BASE_URL}${route.path}`);
			expect(res.status).toBe(200);
		});
	}
});
