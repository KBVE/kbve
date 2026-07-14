import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn, isActiveIn } from '../dashboard/dashboardNav';

export const OSRS_ROOT: DashboardNavItem = {
	label: 'OSRS',
	href: '/osrs/',
};

export const OSRS_NAV: DashboardNavGroup[] = [
	{
		label: 'Database',
		eyebrow: 'Reference',
		href: '/osrs/',
		icon: 'M6 3h12l4 6-10 13L2 9zM11 3 8 9l4 13 4-13-3-6M2 9h20',
		items: [
			{
				label: 'Item Browser',
				href: '/osrs/',
				copy: 'Search every tradeable OSRS item.',
			},
		],
	},
];

const titleCase = (value: string): string =>
	value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const normalize = (path: string): string => {
	const trimmed = path.split('?')[0].split('#')[0];
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

export const isOsrsActive = (pathname: string, href: string): boolean =>
	isActiveIn(OSRS_ROOT.href, pathname, href);

// Gaming > OSRS > <item>. Item pages are flat (/osrs/<slug>/) with no per-item
// nav entry, so the leaf is appended from the path rather than a nav match.
export const buildOsrsBreadcrumb = (pathname: string): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(OSRS_NAV, OSRS_ROOT, pathname);
	crumbs.unshift({ label: 'Gaming', href: '/gaming/' });
	const path = normalize(pathname);
	if (path !== '/osrs/') {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf && leaf !== 'osrs')
			crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
