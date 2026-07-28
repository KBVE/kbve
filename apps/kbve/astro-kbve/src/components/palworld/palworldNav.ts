import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import {
	buildBreadcrumbIn,
	findActiveIn,
	isActiveIn,
} from '../dashboard/dashboardNav';

export const PALWORLD_ROOT: DashboardNavItem = {
	label: 'Palworld',
	href: '/palworld/',
};

export const PALWORLD_NAV: DashboardNavGroup[] = [
	{
		label: 'Server',
		eyebrow: 'Live',
		href: '/palworld/',
		icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5M21 8v8l-9 5M12 13v9',
		items: [
			{
				label: 'Overview',
				href: '/palworld/',
				copy: 'Palworld server hub.',
			},
		],
	},
	{
		label: 'Technical',
		eyebrow: 'Reference',
		href: '/palworld/',
		icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
		items: [
			{
				label: 'Technical notes',
				href: '/project/agones-palworld/',
				copy: 'Docker build, Agones fleet, prestop shim.',
			},
			{
				label: 'Relay bridge',
				href: '/project/agones-palworld-relay/',
				copy: 'REST-primary relay, RCON, IRC bridge.',
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

export const isPalworldActive = (pathname: string, href: string): boolean =>
	isActiveIn(PALWORLD_ROOT.href, pathname, href);

export const buildPalworldBreadcrumb = (
	pathname: string,
): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(PALWORLD_NAV, PALWORLD_ROOT, pathname);
	crumbs.unshift({ label: 'Gaming', href: '/gaming/' });
	const match = findActiveIn(PALWORLD_NAV, PALWORLD_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
