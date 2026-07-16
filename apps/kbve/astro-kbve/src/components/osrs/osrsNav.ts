import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn } from '../dashboard/dashboardNav';
import {
	OSRS_CATEGORIES,
	OSRS_CATEGORY_GROUPS,
	osrsCategoryHref,
} from '@/data/osrs/categories';

export const OSRS_ROOT: DashboardNavItem = {
	label: 'OSRS',
	href: '/osrs/',
};

// Rail is derived from the category manifest so it stays in lockstep with the
// generated /osrs/category/<slug>/ pages. Database sits on top as the full
// browser; the rest group the static category landings by role.
const categoryGroups: DashboardNavGroup[] = OSRS_CATEGORY_GROUPS.map(
	(group) => ({
		label: group.label,
		eyebrow: group.eyebrow,
		icon: group.icon,
		href: osrsCategoryHref(
			OSRS_CATEGORIES.find((c) => c.group === group.label)?.slug ?? '',
		),
		items: OSRS_CATEGORIES.filter((c) => c.group === group.label).map(
			(c) => ({
				label: c.label,
				href: osrsCategoryHref(c.slug),
				copy: c.blurb,
			}),
		),
	}),
);

export const OSRS_NAV: DashboardNavGroup[] = [
	{
		label: 'Database',
		eyebrow: 'Reference',
		href: '/osrs/',
		icon: 'M6 3h12l4 6-10 13L2 9zM11 3 8 9l4 13 4-13-3-6M2 9h20',
		items: [
			{
				label: 'All Items',
				href: '/osrs/',
				copy: 'Search every tradeable OSRS item.',
			},
		],
	},
	...categoryGroups,
];

const titleCase = (value: string): string =>
	value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const normalize = (path: string): string => {
	const trimmed = path.split('?')[0].split('#')[0];
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

// Gaming > OSRS > <category | item>. Category pages resolve through the nav so
// buildBreadcrumbIn already terminates at them; only flat item pages
// (/osrs/<slug>/) need the leaf appended from the path.
export const buildOsrsBreadcrumb = (pathname: string): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(OSRS_NAV, OSRS_ROOT, pathname);
	crumbs.unshift({ label: 'Gaming', href: '/gaming/' });
	const path = normalize(pathname);
	const last = crumbs[crumbs.length - 1];
	const lastIsPath = last && normalize(last.href) === path;
	if (path !== '/osrs/' && !lastIsPath) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf && leaf !== 'osrs')
			crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
