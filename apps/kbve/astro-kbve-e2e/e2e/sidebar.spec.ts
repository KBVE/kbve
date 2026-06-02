import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import {
	SIDEBAR_GROUPS,
	SIDEBAR_GROUP_ORDER,
	SIDEBAR_DASHBOARD_ROOT_LABEL,
	DASHBOARD_ROUTES,
} from './helpers/routes';

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summaryRe(label: string): RegExp {
	return new RegExp(
		`<summary[^>]*>(?:\\s|<[^>]+>)*${escapeRe(label)}\\b`,
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

function authVisibilityHrefRe(href: string): RegExp {
	const esc = escapeRe(href);
	return new RegExp(
		`<a\\b[^>]*?(?:href=["']${esc}["'][^>]*?data-auth-visibility=["'][a-z]+["']|data-auth-visibility=["'][a-z]+["'][^>]*?href=["']${esc}["'])`,
		'i',
	);
}

function extractSidebarHtml(body: string): string {
	const start = body.indexOf('data-kbve-sidebar-root');
	if (start === -1) return body;
	const slice = body.slice(start);
	let depth = 1;
	const tagRe = /<(\/?)div\b[^>]*>/gi;
	let m: RegExpExecArray | null;
	while ((m = tagRe.exec(slice)) !== null) {
		depth += m[1] ? -1 : 1;
		if (depth === 0) return slice.slice(0, m.index + m[0].length);
	}
	return slice;
}

const ARIA_CURRENT_ROUTES = [
	'/dashboard/profile/',
	'/dashboard/account/',
	'/dashboard/market/',
	'/dashboard/kanban/',
	'/dashboard/report/',
	'/dashboard/graph/',
	'/dashboard/security/',
	'/dashboard/agents/',
	'/dashboard/agents/github/',
	'/dashboard/agents/discordsh/',
	'/dashboard/gameops/',
	'/dashboard/gameops/rows/',
	'/dashboard/gameops/factorio/',
	'/dashboard/gameops/mc/',
] as const;

describe('Sidebar nesting (Account + Workspace + Agents + GameOps)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	const sidebarRoutes = DASHBOARD_ROUTES.filter((r) => !r.splash);

	for (const route of sidebarRoutes) {
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

			it(`renders the top-level "${SIDEBAR_DASHBOARD_ROOT_LABEL}" group`, async () => {
				const body = await getBody();
				expect(body).toMatch(summaryRe(SIDEBAR_DASHBOARD_ROOT_LABEL));
			});

			for (const groupKey of [
				'Account',
				'Workspace',
				'Agents',
				'GameOps',
			] as const) {
				const group = SIDEBAR_GROUPS[groupKey];
				it(`renders the ${group.label} group with ${group.items.map((i) => i.label).join(' + ')}`, async () => {
					const body = await getBody();
					const sidebar = extractSidebarHtml(body);
					expect(sidebar).toMatch(summaryRe(group.label));
					for (const item of group.items) {
						expect(sidebar).toMatch(hrefRe(item.href));
					}
				});
			}

			it('orders Account before Workspace before Agents in the sidebar', async () => {
				const sidebar = extractSidebarHtml(await getBody());
				const positions = SIDEBAR_GROUP_ORDER.map((key) => {
					const label = SIDEBAR_GROUPS[key].label;
					return sidebar.search(summaryRe(label));
				});
				for (const pos of positions) expect(pos).toBeGreaterThan(-1);
				for (let i = 1; i < positions.length; i++) {
					expect(positions[i]).toBeGreaterThan(positions[i - 1]);
				}
			});

			it('marks Account-group items with data-auth-visibility', async () => {
				const sidebar = extractSidebarHtml(await getBody());
				for (const item of SIDEBAR_GROUPS.Account.items) {
					expect(sidebar).toMatch(authVisibilityHrefRe(item.href));
				}
			});

			it('marks Workspace-group items with data-auth-visibility', async () => {
				const sidebar = extractSidebarHtml(await getBody());
				for (const item of SIDEBAR_GROUPS.Workspace.items) {
					expect(sidebar).toMatch(authVisibilityHrefRe(item.href));
				}
			});
		});
	}

	describe('aria-current=page on server render', () => {
		for (const path of ARIA_CURRENT_ROUTES) {
			it(`${path} marks its own sidebar link as current`, async () => {
				const body = await (await fetch(`${BASE_URL}${path}`)).text();
				const sidebar = extractSidebarHtml(body);
				expect(sidebar).toMatch(ariaCurrentRe(path));
			});
		}

		it('only one sidebar link is aria-current=page per dashboard page', async () => {
			const body = await (
				await fetch(`${BASE_URL}/dashboard/profile/`)
			).text();
			const sidebar = extractSidebarHtml(body);
			const matches = sidebar.match(/aria-current=["']page["']/gi) ?? [];
			expect(matches.length).toBeGreaterThan(0);
			expect(matches.length).toBe(1);
		});
	});
});
