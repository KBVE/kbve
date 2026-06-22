import { useEffect, useRef, useState } from 'react';
import {
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	Outlet,
	redirect,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router';
import { useAuth as useKbveAuth, useKbve } from '@kbve/rn/auth';
import { reconcileCache, ensureSessionReady } from './lib/loginReadiness';
import { LoginChecklist } from './components/LoginChecklist';
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
import { TalentPage } from './routes/talent';
import { NavBar } from './components/NavBar';
import { Footer } from './components/Footer';

const GigDetailPage = lazyRouteComponent(
	() => import('./routes/gig-detail'),
	'GigDetailPage',
);
const TalentProfilePage = lazyRouteComponent(
	() => import('./routes/talent-profile'),
	'TalentProfilePage',
);
const PostGigPage = lazyRouteComponent(
	() => import('./routes/post-gig'),
	'PostGigPage',
);
const LoginPage = lazyRouteComponent(
	() => import('./routes/login'),
	'LoginPage',
);
const ApplyPage = lazyRouteComponent(
	() => import('./routes/apply'),
	'ApplyPage',
);
const DashboardPage = lazyRouteComponent(
	() => import('./routes/dashboard'),
	'DashboardPage',
);

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

// On the sign-in transition, route to the right place — works for both
// email/password (returns to /login) and social OAuth (returns to the app root
// /). Fires only on the false→true transition so a signed-in user can still
// browse home; a brand-new social signup needing a username is sent to /login
// where SetUsernameScreen renders.
function PostAuthGate({ pathname }: { pathname: string }) {
	const auth = useKbveAuth();
	const { client } = useKbve();
	const navigate = useNavigate();
	const wasSignedIn = useRef(auth.signedIn);
	const running = useRef(false);
	const [steps, setSteps] = useState<{
		idb: boolean;
		cookie: boolean;
	} | null>(null);

	useEffect(() => {
		const go = (to: string) =>
			void Promise.resolve(navigate({ to })).catch(() => {});

		if (!auth.signedIn) {
			wasSignedIn.current = false;
			return;
		}
		const justSignedIn = !wasSignedIn.current;
		wasSignedIn.current = true;

		if (auth.needsUsername) {
			if (pathname !== '/login') go('/login');
			return;
		}

		const dest =
			pathname === '/login'
				? '/dashboard'
				: justSignedIn && pathname === '/'
					? '/dashboard'
					: null;
		if (!dest || running.current) return;

		running.current = true;
		let active = true;
		setSteps({ idb: false, cookie: false });
		void (async () => {
			const uid = auth.user?.id;
			if (uid && (await reconcileCache(uid)) === 'cleared') {
				queryClient.clear();
			}
			if (!active) return;
			setSteps({ idb: true, cookie: false });
			await ensureSessionReady(client);
			if (!active) return;
			setSteps({ idb: true, cookie: true });
			await new Promise((res) => setTimeout(res, 350));
			if (!active) return;
			setSteps(null);
			running.current = false;
			go(dest);
		})();
		return () => {
			active = false;
		};
	}, [
		auth.signedIn,
		auth.needsUsername,
		auth.user?.id,
		pathname,
		navigate,
		client,
	]);

	if (!steps) return null;
	return (
		<LoginChecklist
			steps={[
				{ label: 'Preparing IDB', done: steps.idb },
				{ label: 'Preparing Cookie Auth', done: steps.cookie },
			]}
		/>
	);
}

// Flat route tree (children of root) so getRouteApi('/gigs') etc. resolve
// reliably. The NavBar chrome is shown on every route except /login, which
// renders full-bleed (split screen).
function RootLayout() {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	});
	const gate = <PostAuthGate pathname={pathname} />;
	if (pathname === '/login' || pathname === '/dashboard')
		return (
			<>
				{gate}
				<Outlet />
			</>
		);
	return (
		<div className="min-h-screen text-zinc-100">
			{gate}
			<NavBar />
			<main className="px-6 py-8">
				<Outlet />
			</main>
			<Footer />
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

const applyRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/apply',
	component: ApplyPage,
});

const dashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/dashboard',
	component: DashboardPage,
});

const accountRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/account',
	beforeLoad: () => {
		throw redirect({ to: '/dashboard' });
	},
});

const routeTree = rootRoute.addChildren([
	homeRoute,
	gigsRoute,
	gigDetailRoute,
	talentRoute,
	talentProfileRoute,
	postRoute,
	loginRoute,
	applyRoute,
	dashboardRoute,
	accountRoute,
]);

function RoutePending() {
	return (
		<div className="flex min-h-[40vh] items-center justify-center">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-quest-400" />
		</div>
	);
}

export const router = createRouter({
	routeTree,
	defaultViewTransition: true,
	defaultPreload: 'intent',
	defaultPreloadStaleTime: 0,
	defaultPendingComponent: RoutePending,
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
