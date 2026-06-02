import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { REDIRECT_ALIASES } from './helpers/routes';

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function destinationRe(to: string): RegExp {
	const trimmed = to.replace(/\/$/, '');
	return new RegExp(`${escapeRe(trimmed)}/?$`);
}

function refreshRe(to: string): RegExp {
	const trimmed = to.replace(/\/$/, '');
	return new RegExp(
		`<meta[^>]+http-equiv=["']?refresh["']?[^>]+${escapeRe(trimmed)}/?`,
		'i',
	);
}

describe('Static redirects', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const { from, to } of REDIRECT_ALIASES) {
		it(`${from} redirects to ${to}`, async () => {
			const res = await fetch(`${BASE_URL}${from}`, {
				redirect: 'manual',
			});
			if ([301, 302, 303, 307, 308].includes(res.status)) {
				const location = res.headers.get('location') ?? '';
				expect(location).toMatch(destinationRe(to));
				return;
			}
			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toMatch(refreshRe(to));
		});

		it(`${from} ultimately resolves to a 200 HTML page when followed`, async () => {
			const res = await fetch(`${BASE_URL}${from}`);
			expect(res.status).toBe(200);
			const ct = res.headers.get('content-type') ?? '';
			expect(ct).toContain('text/html');
		});

		it(`${from} destination ${to} embeds the dashboard sidebar root`, async () => {
			const res = await fetch(`${BASE_URL}${from}`);
			const body = await res.text();
			expect(body).toContain('data-kbve-sidebar-root');
		});
	}
});
