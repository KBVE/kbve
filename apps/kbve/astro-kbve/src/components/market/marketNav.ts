import type {
	BreadcrumbCrumb,
	DashboardNavEntry,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn } from '../dashboard/dashboardNav';

export const STORE_ROOT: DashboardNavItem = { label: 'Store', href: '/store/' };
export const MARKET_ROOT: DashboardNavItem = { label: 'Marketplace', href: '/market/' };
export const STORE_ADMIN_ROOT: DashboardNavItem = { label: 'Store Admin', href: '/dashboard/store/' };
export const MARKET_PROFILE_ROOT: DashboardNavItem = { label: 'My Marketplace', href: '/dashboard/market/' };

export const MARKET_NAV: DashboardNavEntry[] = [
	{
		label: 'Commerce',
		eyebrow: 'Buy & trade',
		href: '/store/',
		icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
		items: [
			{ label: 'Store', href: '/store/', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0', copy: 'Spend credits on collectibles.' },
			{ label: 'Marketplace', href: '/market/', icon: 'M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01', copy: 'Player listings settled in KHash.' },
		],
	},
	{
		label: 'Wallet',
		visibility: 'auth',
		href: '/dashboard/account/',
		icon: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z',
		items: [
			{ label: 'Account & Credits', href: '/dashboard/account/', icon: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z' },
			{ label: 'Orders', href: '/store/#orders', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z' },
		],
	},
	{
		label: 'Manage',
		visibility: 'auth',
		href: '/dashboard/market/',
		icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
		items: [
			{ label: 'My Marketplace', href: '/dashboard/market/', icon: 'M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', copy: 'Your listings, bids, and watchlist.' },
			{ label: 'Store Admin', href: '/dashboard/store/', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z', copy: 'Staff catalog + order queue.', visibility: 'staff' },
		],
	},
];

export const buildStoreBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, STORE_ROOT, pathname);

export const buildMarketBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, MARKET_ROOT, pathname);

export const buildStoreAdminBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, STORE_ADMIN_ROOT, pathname);

export const buildMarketProfileBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, MARKET_PROFILE_ROOT, pathname);
