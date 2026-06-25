import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from '@tanstack/react-router';
import { DownloadsPage } from './routes/downloads';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const downloadsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: DownloadsPage,
});

const routeTree = rootRoute.addChildren([downloadsRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
