import {
	buildBreadcrumbIn,
	type BreadcrumbCrumb,
	type DashboardNavEntry,
	type DashboardNavItem,
} from '../dashboard/dashboardNav';

// Icon `d` paths (24×24 stroke) mirrored from data/bento-icons.ts.
const ICON = {
	cube: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5M21 8v8l-9 5M12 13v9',
	sword: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
	crown: 'M6 20h12M6 20l-2-9 5 3 3-7 3 7 5-3-2 9',
	gears: 'M12 2v4m0 12v4M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83m0-14.14-2.83 2.83m-8.48 8.48-2.83 2.83',
	map: 'M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3zM9 7v13M15 4v13',
	book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
	bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
	gamepad:
		'M6 12h4m-2-2v4M15 11h.01M18 13h.01M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258A4 4 0 0 0 17.32 5z',
} as const;

export const GAMING_ROOT: DashboardNavItem = {
	label: 'Gaming',
	href: '/gaming/',
};

// Games that own a top-level section (Minecraft, OSRS, Arcade) link to their
// canonical URL, NOT /gaming/<slug>/. In-house guides live under /gaming/.
export const GAMING_NAV: DashboardNavEntry[] = [
	{ label: 'Overview', href: '/gaming/', icon: ICON.gamepad },
	{ label: 'Minecraft', href: '/mc/', icon: ICON.cube },
	{ label: 'Old School RuneScape', href: '/osrs/', icon: ICON.crown },
	{ label: 'Arcade', href: '/arcade/', icon: ICON.bag },
	{ label: 'BitCraft', href: '/gaming/bitcraft/', icon: ICON.gears },
	{ label: 'League of Legends', href: '/gaming/lol/', icon: ICON.sword },
	{ label: 'RimWorld', href: '/gaming/rimworld/', icon: ICON.map },
	{ label: 'Titanfall', href: '/gaming/titanfall/', icon: ICON.gamepad },
	{ label: 'World of Warcraft', href: '/gaming/wow/', icon: ICON.book },
];

export const buildGamingBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(GAMING_NAV, GAMING_ROOT, pathname);
