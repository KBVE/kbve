import type {
	BreadcrumbCrumb,
	DashboardNavEntry,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn, isActiveIn } from '../dashboard/dashboardNav';

export const LEGAL_ROOT: DashboardNavItem = {
	label: 'Legal',
	href: '/legal/',
};

export const LEGAL_NAV: DashboardNavEntry[] = [
	{
		label: 'Policies',
		eyebrow: 'How we operate',
		icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.59a1 1 0 0 1 .7.29l5.42 5.42a1 1 0 0 1 .29.7V19a2 2 0 0 1-2 2z',
		items: [
			{ label: 'Disclaimer', href: '/legal/disclaimer/' },
			{ label: 'Privacy Policy', href: '/legal/privacy/' },
			{ label: 'Terms of Service', href: '/legal/tos/' },
			{ label: 'EULA', href: '/legal/eula/' },
		],
	},
	{
		label: 'Permissive licenses',
		eyebrow: 'Use, modify, redistribute',
		icon: 'M16 18 22 12 16 6M8 6 2 12 8 18',
		items: [
			{ label: 'MIT', href: '/legal/mit/' },
			{ label: 'Apache 2.0', href: '/legal/apache-2/' },
			{ label: 'BSD 2-Clause', href: '/legal/bsd-2/' },
			{ label: 'BSD 3-Clause', href: '/legal/bsd-3/' },
			{ label: 'ISC', href: '/legal/isc/' },
		],
	},
	{
		label: 'Copyleft licenses',
		eyebrow: 'Share-alike obligations',
		icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9.5a4 4 0 1 0 0 5',
		items: [
			{ label: 'GPL-3.0', href: '/legal/gpl-3/' },
			{ label: 'LGPL-3.0', href: '/legal/lgpl-3/' },
			{ label: 'MPL-2.0', href: '/legal/mpl-2/' },
		],
	},
	{
		label: 'Content & public domain',
		eyebrow: 'Assets and docs',
		icon: 'M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
		items: [
			{ label: 'CC BY 4.0', href: '/legal/cc-by-4/' },
			{ label: 'CC BY-SA 4.0', href: '/legal/cc-by-sa-4/' },
			{ label: 'Unlicense / CC0', href: '/legal/unlicense/' },
		],
	},
];

export const isLegalActive = (pathname: string, href: string): boolean =>
	isActiveIn(LEGAL_ROOT.href, pathname, href);

export const buildLegalBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(LEGAL_NAV, LEGAL_ROOT, pathname);
