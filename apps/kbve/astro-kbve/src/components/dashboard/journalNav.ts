import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from './dashboardNav';
import { buildBreadcrumbIn, isActiveIn } from './dashboardNav';

export const JOURNAL_ROOT: DashboardNavItem = {
	label: 'Journal',
	href: '/journal/',
};

const MONTHS = [
	{ name: 'January', short: 'Jan', days: 31 },
	{ name: 'February', short: 'Feb', days: 29 },
	{ name: 'March', short: 'Mar', days: 31 },
	{ name: 'April', short: 'Apr', days: 30 },
	{ name: 'May', short: 'May', days: 31 },
	{ name: 'June', short: 'Jun', days: 30 },
	{ name: 'July', short: 'Jul', days: 31 },
	{ name: 'August', short: 'Aug', days: 31 },
	{ name: 'September', short: 'Sep', days: 30 },
	{ name: 'October', short: 'Oct', days: 31 },
	{ name: 'November', short: 'Nov', days: 30 },
	{ name: 'December', short: 'Dec', days: 31 },
];

const pad = (n: number) => String(n).padStart(2, '0');

export const JOURNAL_NAV: DashboardNavGroup[] = MONTHS.map((month, i) => ({
	label: month.name,
	eyebrow: 'Daily logs',
	href: `/journal/#${month.name.toLowerCase()}`,
	icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
	items: Array.from({ length: month.days }, (_, d) => ({
		label: `${month.short} ${d + 1}`,
		href: `/journal/${pad(i + 1)}-${pad(d + 1)}/`,
	})),
}));

export const isJournalActive = (pathname: string, href: string): boolean =>
	isActiveIn(JOURNAL_ROOT.href, pathname, href);

export const buildJournalBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(JOURNAL_NAV, JOURNAL_ROOT, pathname);
