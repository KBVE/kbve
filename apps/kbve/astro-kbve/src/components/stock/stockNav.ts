import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn, findActiveIn } from '../dashboard/dashboardNav';

export const STOCK_ROOT: DashboardNavItem = {
	label: 'Stock Analysis',
	href: '/stock/',
};

interface SectorMeta {
	key: string;
	label: string;
	eyebrow: string;
	icon: string;
}

export const SECTOR_META: SectorMeta[] = [
	{
		key: 'etf',
		label: 'ETFs & Funds',
		eyebrow: 'Basket',
		icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
	},
	{
		key: 'technology',
		label: 'Technology',
		eyebrow: 'Sector',
		icon: 'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2M6 6h12v12H6zM9 9h6v6H9z',
	},
	{
		key: 'communication-services',
		label: 'Communication Services',
		eyebrow: 'Sector',
		icon: 'M4 4h16v12H5.17L4 17.17zM8 9h8M8 12h5',
	},
	{
		key: 'consumer-discretionary',
		label: 'Consumer Discretionary',
		eyebrow: 'Sector',
		icon: 'M6 2 3 6v14h18V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
	},
	{
		key: 'consumer-staples',
		label: 'Consumer Staples',
		eyebrow: 'Sector',
		icon: 'M5 8h14l-1 13H6zM9 8V5a3 3 0 0 1 6 0v3',
	},
	{
		key: 'financials',
		label: 'Financials',
		eyebrow: 'Sector',
		icon: 'M3 21h18M4 10h16M12 3 3 8h18zM6 10v11M10 10v11M14 10v11M18 10v11',
	},
	{
		key: 'health-care',
		label: 'Health Care',
		eyebrow: 'Sector',
		icon: 'M12 5v14M5 12h14',
	},
	{
		key: 'industrials',
		label: 'Industrials',
		eyebrow: 'Sector',
		icon: 'M3 21V10l6 4V10l6 4V3h6v18z',
	},
	{
		key: 'energy',
		label: 'Energy',
		eyebrow: 'Sector',
		icon: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
	},
	{
		key: 'materials',
		label: 'Materials',
		eyebrow: 'Sector',
		icon: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
	},
	{
		key: 'utilities',
		label: 'Utilities',
		eyebrow: 'Sector',
		icon: 'M12 2v6M5 8h14l-2 12H7zM9 20v2M15 20v2',
	},
	{
		key: 'real-estate',
		label: 'Real Estate',
		eyebrow: 'Sector',
		icon: 'M3 11 12 3l9 8M5 10v10h14V10M10 20v-6h4v6',
	},
];

const SECTOR_OTHER: SectorMeta = {
	key: 'unclassified',
	label: 'Unclassified',
	eyebrow: 'Unsorted',
	icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
};

export interface StockNavEntry {
	id: string;
	data: {
		title?: string;
		draft?: boolean;
		sidebar?: { label?: string };
		stock?: { ticker?: string; sector?: string; name?: string };
	};
}

const titleCase = (value: string): string =>
	value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const normalize = (path: string): string => {
	const trimmed = path.split('?')[0].split('#')[0];
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

const slugOf = (id: string): string =>
	id.replace(/\.(mdx|md)$/i, '').replace(/^stock\//, '');

const sectorKey = (value: string | undefined): string =>
	value
		? value.trim().toLowerCase().replace(/&/g, '').replace(/\s+/g, '-')
		: SECTOR_OTHER.key;

export const buildStockNav = (
	entries: StockNavEntry[],
): DashboardNavGroup[] => {
	const buckets = new Map<string, DashboardNavItem[]>();

	for (const entry of entries) {
		const slug = slugOf(entry.id);
		if (!slug || slug === 'index' || entry.data.draft === true) continue;
		const key = sectorKey(entry.data.stock?.sector);
		const ticker = entry.data.stock?.ticker;
		const item: DashboardNavItem = {
			label:
				ticker ??
				entry.data.sidebar?.label ??
				entry.data.title ??
				slug.toUpperCase(),
			href: `/stock/${slug}/`,
			copy: entry.data.stock?.name ?? entry.data.title,
		};
		const list = buckets.get(key);
		if (list) list.push(item);
		else buckets.set(key, [item]);
	}

	const order = [...SECTOR_META, SECTOR_OTHER];
	const groups: DashboardNavGroup[] = [];

	for (const meta of order) {
		const items = buckets.get(meta.key);
		if (!items || !items.length) continue;
		items.sort((a, b) => a.label.localeCompare(b.label));
		groups.push({
			label: meta.label,
			eyebrow: meta.eyebrow,
			href: `/stock/#${meta.key}`,
			icon: meta.icon,
			items,
		});
	}

	return groups;
};

export const buildStockBreadcrumb = (
	nav: DashboardNavGroup[],
	pathname: string,
): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(nav, STOCK_ROOT, pathname);
	const match = findActiveIn(nav, STOCK_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
