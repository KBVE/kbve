import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { DASHBOARD_ROUTES } from './helpers/routes';

const titleRe = /<title>([^<]+)<\/title>/i;

function extractTitle(body: string): string {
	const match = body.match(titleRe);
	return match ? match[1].trim() : '';
}

describe('Dashboard routes', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const route of DASHBOARD_ROUTES) {
		describe(`${route.path}`, () => {
			it('returns HTTP 200 with HTML', async () => {
				const res = await fetch(`${BASE_URL}${route.path}`);
				expect(res.status).toBe(200);
				expect(res.headers.get('content-type') ?? '').toContain(
					'text/html',
				);
			});

			it('renders a non-empty <title> containing the page title', async () => {
				const body = await (
					await fetch(`${BASE_URL}${route.path}`)
				).text();
				const title = extractTitle(body);
				expect(title.length).toBeGreaterThan(0);
				expect(title).toContain(route.title);
			});

			it('emits no console-noise headers (x-powered-by absent)', async () => {
				const res = await fetch(`${BASE_URL}${route.path}`);
				expect(res.headers.get('x-powered-by')).toBeNull();
			});

			it('declares a canonical link', async () => {
				const body = await (
					await fetch(`${BASE_URL}${route.path}`)
				).text();
				expect(body).toMatch(
					/<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']+["']/i,
				);
			});

			it('embeds the dashboard sidebar root', async () => {
				const body = await (
					await fetch(`${BASE_URL}${route.path}`)
				).text();
				expect(body).toContain('data-kbve-sidebar-root');
			});
		});
	}
});
