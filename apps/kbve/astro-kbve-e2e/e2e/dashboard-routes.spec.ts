import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { DASHBOARD_ROUTES } from './helpers/routes';

const titleRe = /<title>([^<]+)<\/title>/i;
const h1Re = /<h1[^>]*id=["']_top["'][^>]*>([\s\S]*?)<\/h1>/i;

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTitle(body: string): string {
	const match = body.match(titleRe);
	return match ? match[1].trim() : '';
}

function extractH1(body: string): string | null {
	const match = body.match(h1Re);
	if (!match) return null;
	return match[1].replace(/<[^>]+>/g, '').trim();
}

describe('Dashboard routes', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const route of DASHBOARD_ROUTES) {
		describe(`${route.path}`, () => {
			let bodyPromise: Promise<string> | null = null;
			let resPromise: Promise<Response> | null = null;
			const getRes = () => {
				if (!resPromise) {
					resPromise = fetch(`${BASE_URL}${route.path}`);
				}
				return resPromise;
			};
			const getBody = async () => {
				if (!bodyPromise) {
					bodyPromise = fetch(`${BASE_URL}${route.path}`).then((r) =>
						r.text(),
					);
				}
				return bodyPromise;
			};

			it('returns HTTP 200 with HTML', async () => {
				const res = await getRes();
				expect(res.status).toBe(200);
				expect(res.headers.get('content-type') ?? '').toContain(
					'text/html',
				);
			});

			it('renders a non-empty <title> containing the page title', async () => {
				const body = await getBody();
				const title = extractTitle(body);
				expect(title.length).toBeGreaterThan(0);
				expect(title).toContain(route.title);
			});

			if (route.splash) {
				it('uses the splash template (no <h1 id="_top">)', async () => {
					const body = await getBody();
					expect(body).toContain('data-splash-no-title');
					expect(body).not.toMatch(/<h1[^>]*id=["']_top["']/i);
				});
			} else {
				it('renders the Starlight <h1 id="_top"> with the page title', async () => {
					const body = await getBody();
					const h1 = extractH1(body);
					expect(
						h1,
						`<h1 id="_top"> missing on ${route.path}`,
					).not.toBeNull();
					expect(h1).toBe(route.title);
				});
			}

			it('emits no console-noise headers (x-powered-by absent)', async () => {
				const res = await getRes();
				expect(res.headers.get('x-powered-by')).toBeNull();
			});

			it('declares a canonical link with absolute URL', async () => {
				const body = await getBody();
				const m = body.match(
					/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
				);
				expect(
					m,
					`canonical link missing on ${route.path}`,
				).not.toBeNull();
				expect(m![1]).toMatch(/^https?:\/\//);
			});

			it('emits Open Graph + Twitter card tags', async () => {
				const body = await getBody();
				expect(body).toMatch(/property=["']og:title["']/i);
				expect(body).toMatch(/property=["']og:type["']/i);
				expect(body).toMatch(/(name|property)=["']twitter:card["']/i);
			});

			if (!route.splash) {
				it('embeds the dashboard sidebar root', async () => {
					const body = await getBody();
					expect(body).toContain('data-kbve-sidebar-root');
				});
			} else {
				it('omits the dashboard sidebar root on splash template', async () => {
					const body = await getBody();
					expect(body).not.toContain('data-kbve-sidebar-root');
				});
			}

			if (route.inSidebar !== false && !route.splash) {
				it('links to itself from the sidebar nav', async () => {
					const body = await getBody();
					const re = new RegExp(
						`<a\\b[^>]*\\bhref=["']${escapeRe(route.path)}["']`,
						'i',
					);
					expect(body).toMatch(re);
				});
			}
		});
	}
});
