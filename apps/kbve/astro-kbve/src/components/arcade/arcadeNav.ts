import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn, findActiveIn } from '../dashboard/dashboardNav';
import { ARCADE_GAMES, ARCADE_STATUS_LABEL } from './arcadeGames';
import type { ArcadeStatus } from './arcadeGames';

export const ARCADE_ROOT: DashboardNavItem = {
	label: 'Arcade',
	href: '/arcade/',
};

const STATUS_ORDER: ArcadeStatus[] = ['live', 'beta', 'soon'];

const STATUS_META: Record<ArcadeStatus, { eyebrow: string; icon: string }> = {
	live: {
		eyebrow: 'Playable',
		icon: 'play',
	},
	beta: {
		eyebrow: 'Prototype',
		icon: 'star',
	},
	soon: {
		eyebrow: 'Roadmap',
		icon: 'clock',
	},
};

export const buildArcadeNav = (): DashboardNavGroup[] =>
	STATUS_ORDER.flatMap((status) => {
		const items = ARCADE_GAMES.filter(
			(game) => game.status === status && game.href !== ARCADE_ROOT.href,
		).map<DashboardNavItem>((game) => ({
			label: game.title,
			href: game.href,
			copy: game.description,
		}));
		if (!items.length) return [];
		return [
			{
				label: ARCADE_STATUS_LABEL[status],
				eyebrow: STATUS_META[status].eyebrow,
				icon: STATUS_META[status].icon,
				href:
					status === 'soon' ? '/arcade/#soon' : '/arcade/#available',
				items,
			},
		];
	});

export const ARCADE_NAV = buildArcadeNav();

const normalize = (path: string): string => {
	const trimmed = path.split('?')[0].split('#')[0];
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

const titleCase = (value: string): string =>
	value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const buildArcadeBreadcrumb = (pathname: string): BreadcrumbCrumb[] => {
	const path0 = normalize(pathname);
	// The root is its own crumb; group hrefs are in-page anchors on it, so
	// matching them here would render "Arcade > Play now" on the hub.
	if (path0 === ARCADE_ROOT.href) return [{ ...ARCADE_ROOT }];

	const crumbs = buildBreadcrumbIn(ARCADE_NAV, ARCADE_ROOT, pathname);
	const match = findActiveIn(ARCADE_NAV, ARCADE_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
