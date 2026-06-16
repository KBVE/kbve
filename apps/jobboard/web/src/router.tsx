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
import { HomePage } from './routes/home';
import { GigsPage } from './routes/gigs';
import { GigDetailPage } from './routes/gig-detail';
import { TalentPage } from './routes/talent';
import { TalentProfilePage } from './routes/talent-profile';
import { PostGigPage } from './routes/post-gig';
import { LoginPage } from './routes/login';
import { NavBar } from './components/NavBar';

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
});

const gigDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/gigs/$gigId',
	component: GigDetailPage,
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
});

const talentProfileRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/talent/$handle',
	component: TalentProfilePage,
});

const postRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/post',
	component: PostGigPage,
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

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
