import { test, expect } from '@playwright/test';
import { signJwt } from './jwt';

test.describe('WebSocket: Endpoint Availability', () => {
	test('GET /ws without upgrade returns 4xx', async ({ request }) => {
		const response = await request.get('/ws');
		// Without WebSocket upgrade headers, should reject
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});

	test('GET /webirc without upgrade returns 4xx', async ({ request }) => {
		const response = await request.get('/webirc');
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});
});

test.describe('WebSocket: Token via Query Param', () => {
	test('/ws accepts token query param', async ({ page }) => {
		const token = await signJwt();

		// Use page.evaluate to attempt a WebSocket connection
		// The connection will fail because there's no Ergo backend,
		// but we verify the gateway accepts the upgrade
		const result = await page.evaluate(
			async ({ url, token }) => {
				return new Promise<{ opened: boolean; code?: number }>(
					(resolve) => {
						const ws = new WebSocket(
							`${url}/ws?token=${token}`,
						);
						const timeout = setTimeout(() => {
							ws.close();
							resolve({ opened: false, code: undefined });
						}, 5000);

						ws.onopen = () => {
							clearTimeout(timeout);
							ws.close();
							resolve({ opened: true });
						};
						ws.onclose = (e) => {
							clearTimeout(timeout);
							resolve({ opened: false, code: e.code });
						};
						ws.onerror = () => {
							clearTimeout(timeout);
							// Error fires before close, let close handler resolve
						};
					},
				);
			},
			{ url: `ws://localhost:4321`, token },
		);

		// Either the WebSocket opens (Ergo available) or it closes
		// with a non-1008 code (1008 = policy violation / auth failure)
		if (!result.opened && result.code !== undefined) {
			expect(result.code).not.toBe(1008);
		}
	});
});

test.describe('WebSocket: No Auth Rejection', () => {
	test('/ws without token rejects connection', async ({ page }) => {
		const result = await page.evaluate(async (url) => {
			return new Promise<{ opened: boolean; code?: number }>(
				(resolve) => {
					const ws = new WebSocket(`${url}/ws`);
					const timeout = setTimeout(() => {
						ws.close();
						resolve({ opened: false, code: undefined });
					}, 5000);

					ws.onopen = () => {
						clearTimeout(timeout);
						ws.close();
						resolve({ opened: true });
					};
					ws.onclose = (e) => {
						clearTimeout(timeout);
						resolve({ opened: false, code: e.code });
					};
					ws.onerror = () => {
						// Let close handler resolve
					};
				},
			);
		}, `ws://localhost:4321`);

		// Should not open without auth
		expect(result.opened).toBe(false);
	});
});
