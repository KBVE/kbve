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
		icon: 'M8 5v14l11-7z',
	},
	beta: {
		eyebrow: 'Prototype',
		icon: 'M12 2 15 8l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z',
	},
	soon: {
		eyebrow: 'Roadmap',
		icon: 'M12 6v6l4 2M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z',
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
	const crumbs = buildBreadcrumbIn(ARCADE_NAV, ARCADE_ROOT, pathname);
	const match = findActiveIn(ARCADE_NAV, ARCADE_ROOT.href, pathname);
	const path = normalize(pathname);
	if (match && normalize(match.item.href) !== path) {
		const leaf = path.replace(/\/$/, '').split('/').pop() ?? '';
		if (leaf) crumbs.push({ label: titleCase(leaf), href: path });
	}
	return crumbs;
};
