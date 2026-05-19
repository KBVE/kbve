import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Static redirects', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const from of ['/account', '/account/']) {
		it(`${from} redirects to /profile/account/`, async () => {
			const res = await fetch(`${BASE_URL}${from}`, {
				redirect: 'manual',
			});
			if ([301, 302, 303, 307, 308].includes(res.status)) {
				const location = res.headers.get('location') ?? '';
				expect(location).toMatch(/\/profile\/account\/?$/);
				return;
			}
			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toMatch(
				/<meta[^>]+http-equiv=["']?refresh["']?[^>]+\/profile\/account\/?/i,
			);
		});

		it(`${from} ultimately resolves to a 200 HTML page when followed`, async () => {
			const res = await fetch(`${BASE_URL}${from}`);
			expect(res.status).toBe(200);
			const ct = res.headers.get('content-type') ?? '';
			expect(ct).toContain('text/html');
		});
	}
});
