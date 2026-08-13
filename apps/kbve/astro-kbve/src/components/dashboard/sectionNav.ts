import { getCollection } from 'astro:content';
import type {
	BreadcrumbCrumb,
	DashboardNavEntry,
	DashboardNavItem,
} from './dashboardNav';
import { DASHBOARD_NAV, DASHBOARD_ROOT, buildBreadcrumb } from './dashboardNav';
import {
	APPLICATION_NAV,
	APPLICATION_ROOT,
	buildApplicationBreadcrumb,
} from './applicationNav';
import {
	JOURNAL_NAV,
	JOURNAL_ROOT,
	buildJournalBreadcrumb,
} from './journalNav';
import { THEORY_NAV, THEORY_ROOT, buildTheoryBreadcrumb } from './theoryNav';
import {
	GAMING_NAV,
	GAMING_ROOT,
	buildGamingBreadcrumb,
} from '../gaming/gamingNav';
import { OSRS_NAV, OSRS_ROOT, buildOsrsBreadcrumb } from '../osrs/osrsNav';
import { MC_NAV, MC_ROOT, buildMcBreadcrumb } from '../mcdb/mcNav';
import {
	PALWORLD_NAV,
	PALWORLD_ROOT,
	buildPalworldBreadcrumb,
} from '../palworld/palworldNav';
import { NPC_ROOT, buildNpcNav, buildNpcBreadcrumb } from '../npcdb/npcNav';
import {
	ITEM_ROOT,
	buildItemNav,
	buildItemBreadcrumb,
} from '../itemdb/itemNav';
import { MAP_ROOT, buildMapNav, buildMapBreadcrumb } from '../mapdb/mapNav';
import {
	COMMUNITY_NAV,
	COMMUNITY_RAIL_SLUGS,
	COMMUNITY_ROOT,
	buildCommunityBreadcrumb,
} from '../social/socialNav';
import { LEGAL_NAV, LEGAL_ROOT, buildLegalBreadcrumb } from '../legal/legalNav';
import {
	MARKET_NAV,
	STORE_ROOT,
	MARKET_ROOT,
	STORE_ADMIN_ROOT,
	MARKET_PROFILE_ROOT,
	buildStoreBreadcrumb,
	buildMarketBreadcrumb,
	buildStoreAdminBreadcrumb,
	buildMarketProfileBreadcrumb,
} from '../market/marketNav';
import {
	STOCK_ROOT,
	buildStockNav,
	buildStockBreadcrumb,
} from '../stock/stockNav';
import {
	ARCADE_NAV,
	ARCADE_ROOT,
	buildArcadeBreadcrumb,
} from '../arcade/arcadeNav';
import { adaptStarlightSidebar } from './starlightNav';
import type { StarlightEntry } from './starlightNav';

export interface SectionShell {
	id: string;
	entries: DashboardNavEntry[];
	root: DashboardNavItem;
	menuLabel: string;
	navLabel: string;
	crumbs: BreadcrumbCrumb[];
	collapsible: boolean;
	withToc: boolean;
}

const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);

type CollectionNav<T extends DashboardNavEntry> = () => Promise<T[]>;

const memo = new Map<string, Promise<DashboardNavEntry[]>>();

const cached = <T extends DashboardNavEntry>(
	key: string,
	build: CollectionNav<T>,
): Promise<T[]> => {
	let pending = memo.get(key) as Promise<T[]> | undefined;
	if (!pending) {
		pending = build();
		memo.set(key, pending);
	}
	return pending;
};

const npcEntries = () =>
	cached('npcdb', async () => buildNpcNav(await getCollection('npcdb')));
const itemEntries = () =>
	cached('itemdb', async () => buildItemNav(await getCollection('itemdb')));
const mapEntries = () =>
	cached('mapdb', async () => buildMapNav(await getCollection('mapdb')));
const stockEntries = () =>
	cached('stock', async () =>
		buildStockNav(
			await getCollection(
				'docs',
				({ id }) =>
					id.startsWith('stock/') && !id.endsWith('stock/index'),
			),
		),
	);

/**
 * Resolves the nav shell for a pathname. Single source of truth for both the
 * Starlight sidebar slot (via the route middleware) and the breadcrumb band.
 * `starlightSidebar` is the route's own sidebar, used by sections that derive
 * their rail from Starlight config rather than a hand-authored nav module.
 */
export async function resolveSection(
	pathname: string,
	starlightSidebar: StarlightEntry[] = [],
): Promise<SectionShell | undefined> {
	const path = pathname;
	const slug = norm(path);

	if (path.startsWith('/legal/')) {
		return {
			id: 'legal',
			entries: LEGAL_NAV,
			root: LEGAL_ROOT,
			menuLabel: 'Legal menu',
			navLabel: 'Legal',
			crumbs: buildLegalBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	if (COMMUNITY_RAIL_SLUGS.has(slug)) {
		return {
			id: 'community',
			entries: COMMUNITY_NAV,
			root: COMMUNITY_ROOT,
			menuLabel: 'Community menu',
			navLabel: 'Community',
			crumbs: buildCommunityBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	if (slug === '/dashboard/store/') {
		return {
			id: 'store-admin',
			entries: MARKET_NAV,
			root: STORE_ADMIN_ROOT,
			menuLabel: 'Commerce menu',
			navLabel: 'Commerce',
			crumbs: buildStoreAdminBreadcrumb(path),
			collapsible: true,
			withToc: false,
		};
	}

	if (slug === '/dashboard/market/') {
		return {
			id: 'market-profile',
			entries: MARKET_NAV,
			root: MARKET_PROFILE_ROOT,
			menuLabel: 'Commerce menu',
			navLabel: 'Commerce',
			crumbs: buildMarketProfileBreadcrumb(path),
			collapsible: true,
			withToc: false,
		};
	}

	if (path.startsWith('/dashboard')) {
		return {
			id: 'dashboard',
			entries: DASHBOARD_NAV,
			root: DASHBOARD_ROOT,
			menuLabel: 'Dashboard menu',
			navLabel: 'Dashboard',
			crumbs: buildBreadcrumb(path),
			collapsible: false,
			withToc: false,
		};
	}

	if (path.startsWith('/application/') && path !== '/application/') {
		return {
			id: 'application',
			entries: APPLICATION_NAV,
			root: APPLICATION_ROOT,
			menuLabel: 'Application guides',
			navLabel: 'Applications',
			crumbs: buildApplicationBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	if (path.startsWith('/journal/') && path !== '/journal/') {
		return {
			id: 'journal',
			entries: JOURNAL_NAV,
			root: JOURNAL_ROOT,
			menuLabel: 'Journal days',
			navLabel: 'Journal',
			crumbs: buildJournalBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	if (path.startsWith('/theory/')) {
		return {
			id: 'theory',
			entries: THEORY_NAV,
			root: THEORY_ROOT,
			menuLabel: 'Theory topics',
			navLabel: 'Theory',
			crumbs: buildTheoryBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	if (path.startsWith('/arcade/')) {
		return {
			id: 'arcade',
			entries: ARCADE_NAV,
			root: ARCADE_ROOT,
			menuLabel: 'Arcade games',
			navLabel: 'Arcade',
			crumbs: buildArcadeBreadcrumb(path),
			collapsible: false,
			withToc: false,
		};
	}

	if (path.startsWith('/gaming/') || path === '/osrs/') {
		return {
			id: 'gaming',
			entries: GAMING_NAV,
			root: GAMING_ROOT,
			menuLabel: 'Games',
			navLabel: 'Gaming',
			crumbs: buildGamingBreadcrumb(path),
			collapsible: false,
			withToc: true,
		};
	}

	if (path.startsWith('/osrs/')) {
		return {
			id: 'osrs',
			entries: OSRS_NAV,
			root: OSRS_ROOT,
			menuLabel: 'OSRS database',
			navLabel: 'OSRS',
			crumbs: buildOsrsBreadcrumb(path),
			collapsible: false,
			withToc: false,
		};
	}

	if (path.startsWith('/mc/')) {
		return {
			id: 'mc',
			entries: MC_NAV,
			root: MC_ROOT,
			menuLabel: 'Minecraft database',
			navLabel: 'Minecraft',
			crumbs: buildMcBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	if (path.startsWith('/palworld/')) {
		const shell = adaptStarlightSidebar(starlightSidebar, path);
		return shell
			? {
					id: 'palworld',
					entries: shell.entries,
					root: shell.root,
					menuLabel: shell.navLabel,
					navLabel: shell.navLabel,
					crumbs: shell.crumbs,
					collapsible: true,
					withToc: true,
				}
			: {
					id: 'palworld',
					entries: PALWORLD_NAV,
					root: PALWORLD_ROOT,
					menuLabel: 'Palworld',
					navLabel: 'Palworld',
					crumbs: buildPalworldBreadcrumb(path),
					collapsible: true,
					withToc: true,
				};
	}

	if (path.startsWith('/npcdb/')) {
		const entries = await npcEntries();
		return {
			id: 'npcdb',
			entries,
			root: NPC_ROOT,
			menuLabel: 'NPC database',
			navLabel: 'NPC Database',
			crumbs: buildNpcBreadcrumb(entries, path),
			collapsible: true,
			withToc: true,
		};
	}

	if (path.startsWith('/itemdb/')) {
		const entries = await itemEntries();
		return {
			id: 'itemdb',
			entries,
			root: ITEM_ROOT,
			menuLabel: 'Item database',
			navLabel: 'Item Database',
			crumbs: buildItemBreadcrumb(entries, path),
			collapsible: true,
			withToc: true,
		};
	}

	if (path.startsWith('/mapdb/')) {
		const entries = await mapEntries();
		return {
			id: 'mapdb',
			entries,
			root: MAP_ROOT,
			menuLabel: 'Map database',
			navLabel: 'Map Database',
			crumbs: buildMapBreadcrumb(entries, path),
			collapsible: true,
			withToc: true,
		};
	}

	if (path.startsWith('/stock/')) {
		const entries = await stockEntries();
		return {
			id: 'stock',
			entries,
			root: STOCK_ROOT,
			menuLabel: 'Stock database',
			navLabel: 'Stock Analysis',
			crumbs: buildStockBreadcrumb(entries, path),
			collapsible: true,
			withToc: true,
		};
	}

	if (slug === '/store/') {
		return {
			id: 'store',
			entries: MARKET_NAV,
			root: STORE_ROOT,
			menuLabel: 'Commerce menu',
			navLabel: 'Commerce',
			crumbs: buildStoreBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	if (slug === '/market/') {
		return {
			id: 'market',
			entries: MARKET_NAV,
			root: MARKET_ROOT,
			menuLabel: 'Commerce menu',
			navLabel: 'Commerce',
			crumbs: buildMarketBreadcrumb(path),
			collapsible: true,
			withToc: true,
		};
	}

	return undefined;
}
