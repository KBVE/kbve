import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn, findActiveIn } from '../dashboard/dashboardNav';

export const NPC_ROOT: DashboardNavItem = {
	label: 'NPC Database',
	href: '/npcdb/',
};

interface FamilyMeta {
	key: string;
	label: string;
	eyebrow: string;
	icon: string;
}

export const FAMILY_META: FamilyMeta[] = [
	{
		key: 'humanoid',
		label: 'Humanoid',
		eyebrow: 'Faction',
		icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
	},
	{
		key: 'beast',
		label: 'Beast',
		eyebrow: 'Wildlife',
		icon: 'M11 5c-1.5 0-2.5 1-3 2-.5-.5-1.5-1-2.5-1C4 6 3 7 3 8.5S4 11 5 12l6 6 6-6c1-1 2-2 2-3.5S18 6 16.5 6c-1 0-2 .5-2.5 1-.5-1-1.5-2-3-2z',
	},
	{
		key: 'undead',
		label: 'Undead',
		eyebrow: 'Necrotic',
		icon: 'M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7zM9 21h6M9 10h.01M15 10h.01',
	},
	{
		key: 'construct',
		label: 'Construct',
		eyebrow: 'Assembled',
		icon: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
	},
	{
		key: 'mechanical',
		label: 'Mechanical',
		eyebrow: 'Machine',
		icon: 'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2M6 6h12v12H6zM9 9h6v6H9z',
	},
	{
		key: 'elemental',
		label: 'Elemental',
		eyebrow: 'Primordial',
		icon: 'M12 2s6 5 6 11a6 6 0 0 1-12 0c0-2 1-4 2-5 0 2 1 3 2 3 1 0 2-4 0-9z',
	},
	{
		key: 'spirit',
		label: 'Spirit',
		eyebrow: 'Ethereal',
		icon: 'M9 2C5 2 3 5 3 9v11l3-2 3 2 3-2 3 2 3-2V9c0-4-2-7-6-7zM9 9h.01M15 9h.01',
	},
	{
		key: 'demon',
		label: 'Demon',
		eyebrow: 'Infernal',
		icon: 'M12 2 8 6H4l2 5-2 5 5-1 3 5 3-5 5 1-2-5 2-5h-4l-4-4zM9 12h.01M15 12h.01',
	},
	{
		key: 'dragon',
		label: 'Dragon',
		eyebrow: 'Wyrm',
		icon: 'M2 12c4 0 6-4 10-4 3 0 4 2 4 2l6-3-2 6s-1 4-6 4c-4 0-6 4-10 4l2-6-4-3z',
	},
	{
		key: 'aberration',
		label: 'Aberration',
		eyebrow: 'Voidborn',
		icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
	},
	{
		key: 'plant',
		label: 'Plant',
		eyebrow: 'Flora',
		icon: 'M12 22V8M12 8c0-3 2-5 5-5 0 3-2 5-5 5zM12 12c0-3-2-5-5-5 0 3 2 5 5 5z',
	},
];

const FAMILY_OTHER: FamilyMeta = {
	key: 'unspecified',
	label: 'Other',
	eyebrow: 'Unsorted',
	icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
};

interface NpcEntry {
	id: string;
	data: { name?: string; family?: string; drafted?: boolean };
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

export const buildNpcNav = (entries: NpcEntry[]): DashboardNavGroup[] => {
	const buckets = new Map<string, DashboardNavItem[]>();

	for (const entry of entries) {
		if (isIndex(entry.id) || entry.data.drafted === true) continue;
		const slug = slugOf(entry.id);
		const family = entry.data.family ?? 'unspecified';
		const item: DashboardNavItem = {
			label: entry.data.name ?? titleCase(slug),
			href: `/npcdb/${slug}/`,
		};
		const list = buckets.get(family);
		if (list) list.push(item);
		else buckets.set(family, [item]);
	}

	const order = [...FAMILY_META, FAMILY_OTHER];
	const groups: DashboardNavGroup[] = [];

	for (const meta of order) {
		const items = buckets.get(meta.key);
		if (!items || !items.length) continue;
		items.sort((a, b) => a.label.localeCompare(b.label));
		groups.push({
			label: meta.label,
			eyebrow: meta.eyebrow,
			href: `/npcdb/#${meta.key}`,
			icon: meta.icon,
			items,
		});
	}

	return groups;
};

export const buildNpcBreadcrumb = (
	nav: DashboardNavGroup[],
	pathname: string,
): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(nav, NPC_ROOT, pathname);
	const match = findActiveIn(nav, NPC_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
