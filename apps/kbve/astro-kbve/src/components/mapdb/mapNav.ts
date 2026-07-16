import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn, findActiveIn } from '../dashboard/dashboardNav';

export const MAP_ROOT: DashboardNavItem = {
	label: 'Map Database',
	href: '/mapdb/',
};

interface TypeMeta {
	key: string;
	label: string;
	eyebrow: string;
	icon: string;
}

export const TYPE_META: TypeMeta[] = [
	{
		key: 'settlement',
		label: 'Settlements',
		eyebrow: 'Populated',
		icon: 'M3 21h18M5 21V7l8-4v18M19 21V10l-6-3M9 9v.01M9 12v.01M9 15v.01M9 18v.01',
	},
	{
		key: 'building',
		label: 'Buildings',
		eyebrow: 'Structures',
		icon: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4',
	},
	{
		key: 'arena',
		label: 'Arenas',
		eyebrow: 'Combat',
		icon: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
	},
	{
		key: 'landmark',
		label: 'Landmarks',
		eyebrow: 'Points of interest',
		icon: 'M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3zM9 7v13M15 4v13',
	},
	{
		key: 'resource_node',
		label: 'Resource Nodes',
		eyebrow: 'Harvestable',
		icon: 'M6 3h12l4 6-10 12L2 9z M2 9h20 M12 3 8 9l4 12 4-12-4-6',
	},
	{
		key: 'npc_marker',
		label: 'NPC Markers',
		eyebrow: 'Spawns',
		icon: 'M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
	},
	{
		key: 'prop',
		label: 'Props',
		eyebrow: 'Decor',
		icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
	},
	{
		key: 'container',
		label: 'Containers',
		eyebrow: 'Storage',
		icon: 'M21 8V21H3V8M1 3h22v5H1zM10 12h4',
	},
	{
		key: 'crafting_station',
		label: 'Crafting Stations',
		eyebrow: 'Workbenches',
		icon: 'M12 2v4m0 12v4M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83m0-14.14-2.83 2.83m-8.48 8.48-2.83 2.83',
	},
	{
		key: 'portal',
		label: 'Portals',
		eyebrow: 'Transit',
		icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6z',
	},
];

const FALLBACK_META: TypeMeta = {
	key: 'custom',
	label: 'Other',
	eyebrow: 'Unsorted',
	icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
};

interface MapEntry {
	id: string;
	data: { name?: string; type?: string; drafted?: boolean };
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

export const buildMapNav = (entries: MapEntry[]): DashboardNavGroup[] => {
	const buckets = new Map<string, DashboardNavItem[]>();

	for (const entry of entries) {
		if (isIndex(entry.id) || entry.data.drafted === true) continue;
		const slug = slugOf(entry.id);
		const type = entry.data.type ?? 'custom';
		const item: DashboardNavItem = {
			label: entry.data.name ?? titleCase(slug),
			href: `/mapdb/${slug}/`,
		};
		const list = buckets.get(type);
		if (list) list.push(item);
		else buckets.set(type, [item]);
	}

	const order = [...TYPE_META, FALLBACK_META];
	const groups: DashboardNavGroup[] = [];

	for (const meta of order) {
		const items = buckets.get(meta.key);
		if (!items || !items.length) continue;
		items.sort((a, b) => a.label.localeCompare(b.label));
		groups.push({
			label: meta.label,
			eyebrow: meta.eyebrow,
			href: `/mapdb/#${meta.key}`,
			icon: meta.icon,
			items,
		});
	}

	return groups;
};

export const buildMapBreadcrumb = (
	nav: DashboardNavGroup[],
	pathname: string,
): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(nav, MAP_ROOT, pathname);
	const match = findActiveIn(nav, MAP_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
