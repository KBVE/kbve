import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn, findActiveIn } from '../dashboard/dashboardNav';

export const ITEM_ROOT: DashboardNavItem = {
	label: 'Item Database',
	href: '/itemdb/',
};

interface RarityMeta {
	key: string;
	label: string;
	eyebrow: string;
	icon: string;
}

export const RARITY_META: RarityMeta[] = [
	{
		key: 'mythic',
		label: 'Mythic',
		eyebrow: 'Tier VI',
		icon: 'M6 20h12M6 20l-2-9 5 3 3-7 3 7 5-3-2 9',
	},
	{
		key: 'legendary',
		label: 'Legendary',
		eyebrow: 'Tier V',
		icon: 'M12 2 15 8l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z',
	},
	{
		key: 'epic',
		label: 'Epic',
		eyebrow: 'Tier IV',
		icon: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
	},
	{
		key: 'rare',
		label: 'Rare',
		eyebrow: 'Tier III',
		icon: 'M6 3h12l4 6-10 12L2 9z M2 9h20 M12 3 8 9l4 12 4-12-4-6',
	},
	{
		key: 'uncommon',
		label: 'Uncommon',
		eyebrow: 'Tier II',
		icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
	},
	{
		key: 'common',
		label: 'Common',
		eyebrow: 'Tier I',
		icon: 'M4 7V4h16v3M4 12h16M4 17v3h16v-3M12 4v16',
	},
];

interface ItemEntry {
	id: string;
	data: { name?: string; rarity?: string; key?: number };
}

const titleCase = (value: string): string =>
	value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const normalize = (path: string): string => {
	const trimmed = path.split('?')[0].split('#')[0];
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

const slugOf = (id: string): string => id.replace(/\.(mdx|md)$/i, '');

const isIndex = (id: string): boolean =>
	id === 'index' || slugOf(id) === 'index';

export const buildItemNav = (entries: ItemEntry[]): DashboardNavGroup[] => {
	const buckets = new Map<string, DashboardNavItem[]>();

	for (const entry of entries) {
		if (isIndex(entry.id) || entry.data.key === 0) continue;
		const slug = slugOf(entry.id);
		const rarity = entry.data.rarity ?? 'common';
		const item: DashboardNavItem = {
			label: entry.data.name ?? titleCase(slug),
			href: `/itemdb/${slug}/`,
		};
		const list = buckets.get(rarity);
		if (list) list.push(item);
		else buckets.set(rarity, [item]);
	}

	const groups: DashboardNavGroup[] = [];
	for (const meta of RARITY_META) {
		const items = buckets.get(meta.key);
		if (!items || !items.length) continue;
		items.sort((a, b) => a.label.localeCompare(b.label));
		groups.push({
			label: meta.label,
			eyebrow: meta.eyebrow,
			href: `/itemdb/#${meta.key}`,
			icon: meta.icon,
			items,
		});
	}

	return groups;
};

export const buildItemBreadcrumb = (
	nav: DashboardNavGroup[],
	pathname: string,
): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(nav, ITEM_ROOT, pathname);
	const match = findActiveIn(nav, ITEM_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
