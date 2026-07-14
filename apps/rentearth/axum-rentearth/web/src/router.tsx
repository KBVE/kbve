import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { HomePage } from './routes/home';
import { PlayPage } from './routes/play';
import { DownloadsPage } from './routes/downloads';

function RootLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const bare = pathname === '/play';

	if (bare) return <Outlet />;

	return (
		<div className="flex min-h-screen flex-col">
			<Nav />
			<main className="flex-1">
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
});

const playRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/play',
	component: PlayPage,
});

const downloadsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/downloads',
	component: DownloadsPage,
});

const routeTree = rootRoute.addChildren([homeRoute, playRoute, downloadsRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
