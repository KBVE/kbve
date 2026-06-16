import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
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

const rootRoute = createRootRoute({ component: () => <Outlet /> });

// Pathless layout: the marketplace pages share the NavBar chrome; /login sits
// outside it (full-bleed split screen).
function AppLayout() {
	return (
		<div className="min-h-screen text-zinc-100">
			<NavBar />
			<main className="px-6 py-8">
				<Outlet />
			</main>
		</div>
	);
}

const appLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'app',
	component: AppLayout,
});

const homeRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/',
	component: HomePage,
});

const gigsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
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
	getParentRoute: () => appLayoutRoute,
	path: '/gigs/$gigId',
	component: GigDetailPage,
});

const talentRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
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
	getParentRoute: () => appLayoutRoute,
	path: '/talent/$handle',
	component: TalentProfilePage,
});

const postRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/post',
	component: PostGigPage,
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: LoginPage,
});

const routeTree = rootRoute.addChildren([
	appLayoutRoute.addChildren([
		homeRoute,
		gigsRoute,
		gigDetailRoute,
		talentRoute,
		talentProfileRoute,
		postRoute,
	]),
	loginRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
