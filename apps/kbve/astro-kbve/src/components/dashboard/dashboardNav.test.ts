import { describe, it, expect } from 'vitest';
import { DASHBOARD_NAV, buildBreadcrumb, flatItems } from './dashboardNav';

describe('dashboardNav', () => {
	it('resolves a breadcrumb past the root for every navigable page', () => {
		// The gutter rail and the breadcrumb both read DASHBOARD_NAV, so a page
		// that ships without an entry here renders a lone "Dashboard" crumb and
		// no rail row — which is how /dashboard/orders/ and /dashboard/inventory/
		// went live unnavigable.
		for (const item of flatItems()) {
			const crumbs = buildBreadcrumb(item.href);
			if (item.href === '/dashboard/') {
				expect(crumbs).toHaveLength(1);
				continue;
			}
			expect(
				crumbs.length,
				`${item.href} resolved only to ${crumbs.map((c) => c.label).join(' / ')}`,
			).toBeGreaterThan(1);
			expect(crumbs[crumbs.length - 1]).toMatchObject({
				label: item.label,
				href: item.href,
			});
		}
	});

	it('places the store pages under their own group', () => {
		expect(
			buildBreadcrumb('/dashboard/orders/').map((c) => c.label),
		).toEqual(['Dashboard', 'Store', 'Orders']);
		expect(
			buildBreadcrumb('/dashboard/inventory/').map((c) => c.label),
		).toEqual(['Dashboard', 'Store', 'Inventory']);
	});

	it('gates the store group behind auth rather than staff', () => {
		const store = DASHBOARD_NAV.find(
			(e) => 'items' in e && e.label === 'Store',
		);
		expect(store).toBeDefined();
		expect(store && 'visibility' in store && store.visibility).toBe('auth');
	});

	it('has no duplicate hrefs across groups', () => {
		const hrefs = flatItems().map((i) => i.href);
		expect(new Set(hrefs).size).toBe(hrefs.length);
	});
});
