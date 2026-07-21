export type NavVisibility = 'auth' | 'staff';

export interface DashboardNavItem {
	label: string;
	href: string;
	/** Gates the link via `data-auth-visibility`; omit = always visible. */
	visibility?: NavVisibility;
	/** SVG path `d` for a 24×24 stroke icon. */
	icon?: string;
	/** One-line blurb for card renderings (unused by the rail). */
	copy?: string;
}

export interface DashboardNavGroup {
	label: string;
	items: DashboardNavItem[];
	visibility?: NavVisibility;
	/** Group landing page; breadcrumb links the group crumb here when set. */
	href?: string;
	/** SVG path `d` shared by the group's cards (unused by the rail). */
	icon?: string;
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
				icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
			},
			{
				label: 'Account',
				href: '/dashboard/account/',
				icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
			},
			{
				label: 'Agents',
				href: '/dashboard/agents/',
				icon: 'M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M15 13v2M9 13v2',
			},
			{
				label: 'API',
				href: '/dashboard/api/',
				icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
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
				icon: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9',
			},
			{
				label: 'Edge',
				href: '/dashboard/edge/',
				icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
			},
			{
				label: 'Virtual Machines',
				href: '/dashboard/vm/',
				icon: 'M2 2h20v8H2zM2 14h20v8H2zM6 6h.01M6 18h.01',
			},
			{
				label: 'ClickHouse',
				href: '/dashboard/clickhouse/',
				icon: 'M12 2C7 2 3 3.34 3 5s4 3 9 3 9-1.34 9-3-4-3-9-3zM3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3',
			},
			{
				label: 'Cube',
				href: '/dashboard/cube/',
				icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
			},
			{
				label: 'Grafana',
				href: '/dashboard/grafana/',
				icon: 'M12 20V10M18 20V4M6 20v-4',
			},
			{
				label: 'Forgejo',
				href: '/dashboard/forgejo/',
				icon: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M12 12v3',
			},
			{
				label: 'Workflows',
				href: '/dashboard/workflows/',
				icon: 'M3 3h6v6H3zM15 15h6v6h-6zM6 9v6a2 2 0 0 0 2 2h4M15 6h3a2 2 0 0 1 2 2v3',
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
				icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
			},
			{
				label: 'Dependency Graph',
				href: '/dashboard/graph/',
				icon: 'M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 5h10M7 5a7 7 0 0 0 7 7M17 5a7 7 0 0 0-7 7v5',
			},
			{
				label: 'Workspace Report',
				href: '/dashboard/report/',
				icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
			},
			{
				label: 'Security',
				href: '/dashboard/security/',
				icon: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z',
			},
			{
				label: 'CI Health',
				href: '/dashboard/ci-health/',
				icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
			},
			{
				label: 'Dependencies',
				href: '/dashboard/deps/',
				icon: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
			},
			{
				label: 'Activity',
				href: '/dashboard/activity/',
				icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9',
			},
			{
				label: 'Releases',
				href: '/dashboard/releases/',
				icon: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
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
				icon: 'M6 12h4m-2-2v4M15 11h.01M18 13h.01M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258A4 4 0 0 0 17.32 5z',
			},
			{
				label: 'Factorio',
				href: '/dashboard/gameops/factorio/',
				icon: 'M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM17 18h1M12 18h1M7 18h1',
			},
			{
				label: 'Minecraft',
				href: '/dashboard/gameops/mc/',
				icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5M21 8v8l-9 5M12 13v9',
			},
			{
				label: 'Vibeshine',
				href: '/dashboard/gameops/vibeshine/',
				icon: 'M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 20h.01',
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
