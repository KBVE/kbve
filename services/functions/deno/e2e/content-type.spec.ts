import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

describe('Content-Type Validation', () => {
	let serviceToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
	});

	// Note: 'logs' excluded — ClickHouse client init fails without credentials,
	// so the worker never reaches the Content-Type check in e2e (no real CH).
	const endpoints = [
		'user-vault',
		'vault-reader',
		'meme',
		'discordsh',
		'guild-vault',
	];

	for (const endpoint of endpoints) {
		it(`should return 415 for ${endpoint} when Content-Type is not application/json`, async () => {
			const res = await fetch(`${BASE_URL}/${endpoint}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/plain',
					Authorization: `Bearer ${serviceToken}`,
				},
				body: '{}',
			});
			expect(res.status).toBe(415);
			const body = await res.json();
			expect(body.error).toContain('Content-Type');
		});

		it(`should return 415 for ${endpoint} when Content-Type header is missing`, async () => {
			const res = await fetch(`${BASE_URL}/${endpoint}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${serviceToken}`,
				},
				body: '{}',
			});
			expect(res.status).toBe(415);
			const body = await res.json();
			expect(body.error).toContain('Content-Type');
		});
	}
});
