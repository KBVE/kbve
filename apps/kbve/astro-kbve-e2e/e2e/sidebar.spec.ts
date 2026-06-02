import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { SIDEBAR_GROUPS, DASHBOARD_ROUTES } from './helpers/routes';

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summaryRe(label: string): RegExp {
	return new RegExp(
		`<summary[^>]*>\\s*(?:<[^>]+>\\s*)*${escapeRe(label)}`,
		'i',
	);
}

function hrefRe(href: string): RegExp {
	return new RegExp(`<a\\b[^>]*\\bhref=["']${escapeRe(href)}["']`, 'i');
}

function ariaCurrentRe(href: string): RegExp {
	const esc = escapeRe(href);
	return new RegExp(
		`<a\\b[^>]*?(?:href=["']${esc}["'][^>]*?aria-current=["']page["']|aria-current=["']page["'][^>]*?href=["']${esc}["'])`,
		'i',
	);
}

const ARIA_CURRENT_ROUTES = [
	'/dashboard/profile/',
	'/dashboard/account/',
	'/dashboard/market/',
	'/dashboard/kanban/',
	'/dashboard/report/',
	'/dashboard/graph/',
	'/dashboard/security/',
] as const;

describe('Sidebar nesting (Account + Workspace groups)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const route of DASHBOARD_ROUTES) {
		describe(`as rendered on ${route.path}`, () => {
			let bodyPromise: Promise<string> | null = null;
			const getBody = () => {
				if (!bodyPromise) {
					bodyPromise = fetch(`${BASE_URL}${route.path}`).then((r) =>
						r.text(),
					);
				}
				return bodyPromise;
			};

			it('mounts the kbve sidebar wrapper', async () => {
				const body = await getBody();
				expect(body).toContain('data-kbve-sidebar-root');
			});

			it('renders the Account group with Profile + Account + Marketplace', async () => {
				const body = await getBody();
				expect(body).toMatch(summaryRe('Account'));
				for (const item of SIDEBAR_GROUPS.Account) {
					expect(body).toMatch(hrefRe(item.href));
				}
			});

			it('renders the Workspace group with Kanban + Report + Graph + Security', async () => {
				const body = await getBody();
				expect(body).toMatch(summaryRe('Workspace'));
				for (const item of SIDEBAR_GROUPS.Workspace) {
					expect(body).toMatch(hrefRe(item.href));
				}
			});
		});
	}

	describe('aria-current=page on server render', () => {
		for (const path of ARIA_CURRENT_ROUTES) {
			it(`${path} marks its own sidebar link as current`, async () => {
				const body = await (await fetch(`${BASE_URL}${path}`)).text();
				expect(body).toMatch(ariaCurrentRe(path));
			});
		}
	});
});
