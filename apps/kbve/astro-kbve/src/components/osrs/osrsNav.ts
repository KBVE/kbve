import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn } from '../dashboard/dashboardNav';

export const OSRS_ROOT: DashboardNavItem = {
	label: 'OSRS',
	href: '/osrs/',
};

// Rail categories mirror the OSRSItemBrowser tag filters. Each href carries a
// ?tag= query the browser reads on mount, so a rail click lands on /osrs/ with
// that filter already applied. Query strings normalize away to /osrs/ in the
// active check, so these never falsely mark active on an item page — the rail
// stays a stable category launcher rather than a per-item tree.
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
	{
		label: 'Gear',
		eyebrow: 'Equipable',
		href: '/osrs/?tag=equipment',
		icon: 'M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4z',
		items: [
			{
				label: 'Equipment',
				href: '/osrs/?tag=equipment',
				copy: 'Weapons, armour, and worn gear.',
			},
			{
				label: 'Ammunition',
				href: '/osrs/?tag=ammo',
				copy: 'Arrows, bolts, and thrown ammo.',
			},
			{
				label: 'Prayer',
				href: '/osrs/?tag=prayer',
				copy: 'Bones, ashes, and prayer supplies.',
			},
		],
	},
	{
		label: 'Consumables',
		eyebrow: 'Supplies',
		href: '/osrs/?tag=food',
		icon: 'M6 2v20M6 8h4V2M18 2c-2 0-3 2-3 5s1 5 3 5v10',
		items: [
			{
				label: 'Food',
				href: '/osrs/?tag=food',
				copy: 'Healing food and drinks.',
			},
			{
				label: 'Potions',
				href: '/osrs/?tag=potion',
				copy: 'Brewed potions and doses.',
			},
			{
				label: 'Teleport',
				href: '/osrs/?tag=teleport',
				copy: 'Tabs, scrolls, and teleport items.',
			},
		],
	},
	{
		label: 'Sources',
		eyebrow: 'Obtained',
		href: '/osrs/?tag=drop',
		icon: 'M12 2C8 8 5 11 5 15a7 7 0 0 0 14 0c0-4-3-7-7-13z',
		items: [
			{
				label: 'Drops',
				href: '/osrs/?tag=drop',
				copy: 'Monster and boss drops.',
			},
			{
				label: 'Farming',
				href: '/osrs/?tag=farm',
				copy: 'Seeds, crops, and produce.',
			},
			{
				label: 'Gathering',
				href: '/osrs/?tag=gather',
				copy: 'Ores, logs, fish, and raw resources.',
			},
			{
				label: 'Quest',
				href: '/osrs/?tag=quest',
				copy: 'Quest-related items.',
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
