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

export const MC_ROOT: DashboardNavItem = {
	label: 'Minecraft',
	href: '/mc/',
};

export const MC_NAV: DashboardNavGroup[] = [
	{
		label: 'Database',
		eyebrow: 'Reference',
		href: '/mc/',
		icon: 'M12 2C7 2 3 3.34 3 5s4 3 9 3 9-1.34 9-3-4-3-9-3zM3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3',
		items: [
			{
				label: 'Items',
				href: '/mc/items/',
				copy: 'Every craftable and obtainable item.',
			},
			{
				label: 'Blocks',
				href: '/mc/blocks/',
				copy: 'Placeable blocks and their properties.',
			},
			{
				label: 'Enchants',
				href: '/mc/enchants/',
				copy: 'Enchantment effects and tiers.',
			},
			{
				label: 'Schematics',
				href: '/mc/schematics/',
				copy: 'Build blueprints and structures.',
			},
			{
				label: 'Lots',
				href: '/mc/lots/',
				copy: 'Server plots and claims.',
			},
			{
				label: 'World',
				href: '/mc/world/',
				copy: 'Biomes, dimensions, and world data.',
			},
		],
	},
	{
		label: 'Server',
		eyebrow: 'Live',
		href: '/mc/',
		icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5M21 8v8l-9 5M12 13v9',
		items: [
			{ label: 'Overview', href: '/mc/', copy: 'Minecraft server hub.' },
			{
				label: 'Agents',
				href: '/mc/agents/',
				copy: 'Automation agents and bots.',
			},
			{
				label: 'Players',
				href: '/mc/players/',
				copy: 'Player profiles and stats.',
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

export const isMcActive = (pathname: string, href: string): boolean =>
	isActiveIn(MC_ROOT.href, pathname, href);

export const buildMcBreadcrumb = (pathname: string): BreadcrumbCrumb[] => {
	const crumbs = buildBreadcrumbIn(MC_NAV, MC_ROOT, pathname);
	crumbs.unshift({ label: 'Gaming', href: '/gaming/' });
	const match = findActiveIn(MC_NAV, MC_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
