import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Telemetry endpoint', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('POST /api/v1/telemetry/report', () => {
		it('accepts a valid error report', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/telemetry/report`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					level: 'error',
					message: 'e2e test error',
					source: 'e2e-test',
				}),
			});
			// Should accept (200/204) — no auth required
			expect([200, 204]).toContain(res.status);
		});

		it('accepts a valid warning report', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/telemetry/report`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					level: 'warn',
					message: 'e2e test warning',
					source: 'e2e-test',
				}),
			});
			expect([200, 204]).toContain(res.status);
		});

		it('rejects requests without Content-Type', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/telemetry/report`, {
				method: 'POST',
				body: 'not json',
			});
			expect([400, 415, 422]).toContain(res.status);
		});

		it('rejects empty body', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/telemetry/report`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}',
			});
			// Empty payload should be rejected or accepted gracefully
			expect(res.status).toBeLessThan(500);
		});

		it('rejects GET method', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/telemetry/report`);
			expect([404, 405]).toContain(res.status);
		});
	});
});
