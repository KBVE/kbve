import {
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
} from '@tanstack/react-router';
import { HomePage } from './routes/home';
import { JobsPage } from './routes/jobs';
import { JobDetailPage } from './routes/job-detail';

const rootRoute = createRootRoute({
	component: () => (
		<div className="min-h-screen bg-zinc-950 text-zinc-100">
			<header className="border-b border-zinc-800 px-6 py-4">
				<nav className="flex gap-6 text-sm">
					<Link to="/" className="font-semibold">
						KBVE Jobs
					</Link>
					<Link to="/jobs" className="[&.active]:text-sky-400">
						Browse
					</Link>
				</nav>
			</header>
			<main className="px-6 py-8">
				<Outlet />
			</main>
		</div>
	),
});

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: HomePage,
});

const jobsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/jobs',
	component: JobsPage,
});

const jobDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/jobs/$jobId',
	component: JobDetailPage,
});

const routeTree = rootRoute.addChildren([homeRoute, jobsRoute, jobDetailRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
