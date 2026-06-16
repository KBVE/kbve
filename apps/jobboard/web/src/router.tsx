import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import type {
	Availability,
	GigQuery,
	LocationPref,
	TalentQuery,
} from './api/types';
import {
	fetchGig,
	fetchGigs,
	fetchTalent,
	fetchTalentByHandle,
	fetchTaxonomy,
} from './api/client';
import { queryClient } from './lib/queryClient';
import { HomePage } from './routes/home';
import { GigsPage } from './routes/gigs';
import { GigDetailPage } from './routes/gig-detail';
import { TalentPage } from './routes/talent';
import { TalentProfilePage } from './routes/talent-profile';
import { PostGigPage } from './routes/post-gig';
import { LoginPage } from './routes/login';
import { NavBar } from './components/NavBar';

const GAME_DEV_ID = 1;

const prefetchTaxonomy = () =>
	queryClient.ensureQueryData({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});

const str = (v: unknown): string | undefined =>
	typeof v === 'string' && v !== '' ? v : undefined;
const num = (v: unknown): number | undefined => {
	const n = Number(v);
	return v === undefined || v === '' || Number.isNaN(n) ? undefined : n;
};

// Flat route tree (children of root) so getRouteApi('/gigs') etc. resolve
// reliably. The NavBar chrome is shown on every route except /login, which
// renders full-bleed (split screen).
function RootLayout() {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	});
	if (pathname === '/login') return <Outlet />;
	return (
		<div className="min-h-screen text-zinc-100">
			<NavBar />
			<main className="px-6 py-8">
				<Outlet />
			</main>
		</div>
	);
}

const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: HomePage,
	loader: () =>
		Promise.all([
			queryClient.ensureQueryData({
				queryKey: ['gigs', {}],
				queryFn: () => fetchGigs({}),
			}),
			queryClient.ensureQueryData({
				queryKey: ['talent-list', {}],
				queryFn: () => fetchTalent({}),
			}),
		]),
});

const gigsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/gigs',
	component: GigsPage,
	validateSearch: (search: Record<string, unknown>): GigQuery => ({
		q: str(search.q),
		discipline: str(search.discipline),
		tool: str(search.tool),
		skill: str(search.skill),
		location_pref: num(search.location_pref) as LocationPref | undefined,
		budget_min: num(search.budget_min),
		cursor: str(search.cursor),
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) =>
		Promise.all([
			prefetchTaxonomy(),
			queryClient.ensureQueryData({
				queryKey: ['gigs', deps],
				queryFn: () => fetchGigs(deps),
			}),
		]),
});

const gigDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/gigs/$gigId',
	component: GigDetailPage,
	loader: ({ params }) =>
		queryClient.ensureQueryData({
			queryKey: ['gig', params.gigId],
			queryFn: () => fetchGig(params.gigId),
		}),
});

const talentRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/talent',
	component: TalentPage,
	validateSearch: (search: Record<string, unknown>): TalentQuery => ({
		q: str(search.q),
		discipline: str(search.discipline),
		tool: str(search.tool),
		availability: num(search.availability) as Availability | undefined,
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) =>
		Promise.all([
			prefetchTaxonomy(),
			queryClient.ensureQueryData({
				queryKey: ['talent-list', deps],
				queryFn: () => fetchTalent(deps),
			}),
		]),
});

const talentProfileRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/talent/$handle',
	component: TalentProfilePage,
	loader: ({ params }) =>
		queryClient.ensureQueryData({
			queryKey: ['talent', params.handle],
			queryFn: () => fetchTalentByHandle(params.handle),
		}),
});

const postRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/post',
	component: PostGigPage,
	loader: () => prefetchTaxonomy(),
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: LoginPage,
});

const routeTree = rootRoute.addChildren([
	homeRoute,
	gigsRoute,
	gigDetailRoute,
	talentRoute,
	talentProfileRoute,
	postRoute,
	loginRoute,
]);

export const router = createRouter({
	routeTree,
	defaultViewTransition: true,
	defaultPreload: 'intent',
	defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
