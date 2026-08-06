import type { IconName } from '@kbve/rn/icons';

export type NavVisibility = 'auth' | 'staff';

/**
 * Preferred form is a key from the registry shared with the native app
 * (`@kbve/rn/icons`). A raw 24×24 SVG path `d` is still accepted for the
 * section navs that have not been migrated yet; the rail renders either.
 */
export type NavIcon = IconName | (string & {});

export interface DashboardNavItem {
	label: string;
	href: string;
	/** Gates the link via `data-auth-visibility`; omit = always visible. */
	visibility?: NavVisibility;
	/** See [[NavIcon]]. */
	icon?: NavIcon;
	/** One-line blurb for card renderings (unused by the rail). */
	copy?: string;
}

export interface DashboardNavGroup {
	label: string;
	items: DashboardNavItem[];
	visibility?: NavVisibility;
	/** Group landing page; breadcrumb links the group crumb here when set. */
	href?: string;
	/** See [[NavIcon]]. Shared by the group's cards (unused by the rail). */
	icon?: NavIcon;
	/** Section eyebrow for card renderings (unused by the rail). */
	eyebrow?: string;
}

export type DashboardNavEntry = DashboardNavItem | DashboardNavGroup;

export interface BreadcrumbCrumb {
	label: string;
	href: string;
}

export const DASHBOARD_ROOT: DashboardNavItem = {
	label: 'Dashboard',
	href: '/dashboard/',
};

export const DASHBOARD_NAV: DashboardNavEntry[] = [
	{
		label: 'General',
		items: [
			{
				label: 'Overview',
				href: '/dashboard/',
				icon: 'dashboard',
			},
			{
				label: 'Account',
				href: '/dashboard/account/',
				icon: 'user',
			},
			{
				label: 'Agents',
				href: '/dashboard/agents/',
				icon: 'bot',
			},
			{
				label: 'API',
				href: '/dashboard/api/',
				icon: 'code',
			},
		],
	},
	{
		label: 'Infrastructure',
		visibility: 'staff',
		href: '/dashboard/infrastructure/',
		items: [
			{
				label: 'Argo',
				href: '/dashboard/argo/',
				icon: 'gitBranch',
			},
			{
				label: 'Edge',
				href: '/dashboard/edge/',
				icon: 'zap',
			},
			{
				label: 'Storage',
				href: '/dashboard/storage/',
				icon: 'hardDrive',
			},
			{
				label: 'Virtual Machines',
				href: '/dashboard/vm/',
				icon: 'server',
			},
			{
				label: 'ClickHouse',
				href: '/dashboard/clickhouse/',
				icon: 'database',
			},
			{
				label: 'Cube',
				href: '/dashboard/cube/',
				icon: 'cube',
			},
			{
				label: 'Grafana',
				href: '/dashboard/grafana/',
				icon: 'chart',
			},
			{
				label: 'Forgejo',
				href: '/dashboard/forgejo/',
				icon: 'gitFork',
			},
			{
				label: 'Workflows',
				href: '/dashboard/workflows/',
				icon: 'workflow',
			},
		],
	},
	{
		label: 'Store',
		visibility: 'auth',
		href: '/store/',
		items: [
			{
				label: 'Orders',
				href: '/dashboard/orders/',
				icon: 'bag',
			},
			{
				label: 'Inventory',
				href: '/dashboard/inventory/',
				icon: 'cube',
			},
		],
	},
	{
		label: 'Insights',
		visibility: 'staff',
		eyebrow: 'Daily',
		items: [
			{
				label: 'Kanban',
				href: '/dashboard/kanban/',
				icon: 'kanban',
			},
			{
				label: 'Dependency Graph',
				href: '/dashboard/graph/',
				icon: 'graph',
			},
			{
				label: 'Workspace Report',
				href: '/dashboard/report/',
				icon: 'report',
			},
			{
				label: 'Security',
				href: '/dashboard/security/',
				icon: 'shield',
			},
			{
				label: 'CI Health',
				href: '/dashboard/ci-health/',
				icon: 'activity',
			},
			{
				label: 'Dependencies',
				href: '/dashboard/deps/',
				icon: 'layers',
			},
			{
				label: 'Activity',
				href: '/dashboard/activity/',
				icon: 'users',
			},
			{
				label: 'Releases',
				href: '/dashboard/releases/',
				icon: 'tag',
			},
		],
	},
	{
		label: 'GameOps',
		visibility: 'staff',
		href: '/dashboard/gameops/',
		items: [
			{
				label: 'ROWS',
				href: '/dashboard/gameops/rows/',
				icon: 'gamepad',
			},
			{
				label: 'Factorio',
				href: '/dashboard/gameops/factorio/',
				icon: 'factory',
			},
			{
				label: 'Minecraft',
				href: '/dashboard/gameops/mc/',
				icon: 'pickaxe',
			},
			{
				label: 'Vibeshine',
				href: '/dashboard/gameops/vibeshine/',
				icon: 'cast',
			},
		],
	},
];

const isGroup = (entry: DashboardNavEntry): entry is DashboardNavGroup =>
	(entry as DashboardNavGroup).items !== undefined;

const normalize = (path: string): string => {
	if (!path) return '/';
	const trimmed = path.split('?')[0].split('#')[0];
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

export const isActiveIn = (
	rootHref: string,
	pathname: string,
	href: string,
): boolean => {
	const a = normalize(pathname);
	const b = normalize(href);
	if (a === b) return true;
	if (b === normalize(rootHref)) return false;
	return a.startsWith(b);
};

export const isActive = (pathname: string, href: string): boolean =>
	isActiveIn(DASHBOARD_ROOT.href, pathname, href);

const flatItems = (): DashboardNavItem[] => {
	const items: DashboardNavItem[] = [];
	for (const entry of DASHBOARD_NAV) {
		if (isGroup(entry)) items.push(...entry.items);
		else items.push(entry);
	}
	return items;
};

export interface ActiveMatch {
	item: DashboardNavItem;
	group?: DashboardNavGroup;
}

export const findActiveIn = (
	nav: DashboardNavEntry[],
	rootHref: string,
	pathname: string,
): ActiveMatch | undefined => {
	const path = normalize(pathname);
	let best: ActiveMatch | undefined;
	let bestLen = -1;
	for (const entry of nav) {
		if (isGroup(entry)) {
			for (const item of entry.items) {
				if (
					isActiveIn(rootHref, path, item.href) &&
					item.href.length > bestLen
				) {
					best = { item, group: entry };
					bestLen = item.href.length;
				}
			}
		} else if (
			isActiveIn(rootHref, path, entry.href) &&
			entry.href.length > bestLen
		) {
			best = { item: entry };
			bestLen = entry.href.length;
		}
	}
	return best;
};

export const findActive = (pathname: string): ActiveMatch | undefined =>
	findActiveIn(DASHBOARD_NAV, DASHBOARD_ROOT.href, pathname);

export const buildBreadcrumbIn = (
	nav: DashboardNavEntry[],
	root: DashboardNavItem,
	pathname: string,
): BreadcrumbCrumb[] => {
	const crumbs: BreadcrumbCrumb[] = [root];
	const path = normalize(pathname);
	for (const entry of nav) {
		if (isGroup(entry) && entry.href && normalize(entry.href) === path) {
			crumbs.push({ label: entry.label, href: entry.href });
			return crumbs;
		}
	}
	const match = findActiveIn(nav, root.href, pathname);
	if (!match) return crumbs;
	if (match.item.href === root.href) return crumbs;
	if (match.group) {
		crumbs.push({
			label: match.group.label,
			href: match.group.href ?? match.item.href,
		});
	}
	crumbs.push({ label: match.item.label, href: match.item.href });
	return crumbs;
};

export const buildBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(DASHBOARD_NAV, DASHBOARD_ROOT, pathname);

export { isGroup, flatItems };
